/**
 * Cast-net research step.
 *
 * For each at-risk signal (forming or stalled state) in the context, generate
 * diverse query variants via LLM, run them through Reddit + HN ingest, and
 * record the research attempt. Returns a report; downstream steps recompute
 * lifecycle to detect what materialized vs what stayed stalled.
 *
 * Args: { context, asOf?, atRiskStates?=['forming','stalled','emerging'], variantsPerSignal?=4, perVariantLimit?=10, producers?=['hackernews'], signalLimit?=3 }
 * Returns: { attempts: [{ signal_id, signal_title, prior_state, queries, packetsBefore, packetsAfter }] }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";
import { getProducer } from "../../pipeline/producers/registry.mjs";

const MODEL = "google/gemini-2.0-flash-001";

async function generateQueryVariants(signal, contextLabel, n = 4) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const prompt = `You are a research strategist. The following signal is at risk (forming/stalled — not enough evidence to confirm or refute).

Context: ${contextLabel}
Signal: ${signal.title}
Tags: ${(signal.tags || []).join(", ") || "(none)"}
Current evidence count: ${signal.evidence_total || 0} total, ${signal.evidence_30d || 0} in last 30 days

Generate ${n} DISTINCT search query variations that would help discover whether this signal is real and progressing. Cover different angles:
- A direct keyword query (the most natural phrasing)
- A symptomatic query (the user-felt problem behind the signal)
- An adjacent-community query (what someone in a tangential community would say)
- A skeptical-or-failure query (people complaining about, or failing at, this)

Each query should be a natural-language search string (NOT including site: or other operators). Return ONLY valid JSON: { "queries": ["query1", "query2", ...] }`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim() || "{}";
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.queries) ? parsed.queries.slice(0, n) : [];
  } catch {
    return [];
  }
}

function safeJson(v, f) { try { return typeof v === "string" ? JSON.parse(v) : (v ?? f); } catch { return f; } }

export default async function castNet({
  context,
  asOf = null,
  atRiskStates = ["forming", "stalled", "emerging"],
  variantsPerSignal = 4,
  perVariantLimit = 10,
  producers = ["hackernews"],
  signalLimit = 3,
} = {}) {
  if (!context) throw new Error("context is required");
  const db = getDb();
  const states = Array.isArray(atRiskStates)
    ? atRiskStates
    : typeof atRiskStates === "string" ? atRiskStates.split(",").map(s => s.trim()) : [];
  const producerList = Array.isArray(producers)
    ? producers
    : typeof producers === "string" ? producers.split(",").map(s => s.trim()) : [];

  const ctx = db.prepare(`SELECT id, label FROM contexts WHERE id = ?`).get(context);
  if (!ctx) throw new Error(`Context not found: ${context}`);

  const placeholders = states.map(() => "?").join(",");
  const candidates = db.prepare(`
    SELECT s.id, s.title, s.tags,
           sl.state, sl.evidence_total, sl.evidence_30d, sl.evidence_7d
    FROM signal_lifecycle sl
    JOIN signals s ON s.id = sl.signal_id
    WHERE sl.context_id = ? AND sl.state IN (${placeholders})
    ORDER BY sl.evidence_30d DESC, sl.evidence_total DESC
    LIMIT ?
  `).all(context, ...states, signalLimit);

  if (!candidates.length) {
    return { attempts: [], reason: `No signals in [${states.join(",")}] state for ${context}` };
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO evidence_packets
      (id, context_id, source_id, source_layer, source_item_id, url, title, body,
       author_ref, community, observed_at, published_at, metrics, topics, raw_ref,
       content_hash, intent, awareness_level, evidence_weight, quality_score,
       sentiment, evidence_state, source_kind)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const attempts = [];
  for (const sig of candidates) {
    const tags = safeJson(sig.tags, []);
    const before = db.prepare(`
      SELECT COUNT(*) AS c FROM evidence_packets WHERE context_id = ?
    `).get(context).c;

    let queries = [];
    try {
      queries = await generateQueryVariants({ ...sig, tags }, ctx.label, variantsPerSignal);
    } catch (err) {
      attempts.push({ signal_id: sig.id, signal_title: sig.title, prior_state: sig.state, error: err.message });
      continue;
    }
    if (!queries.length) {
      attempts.push({ signal_id: sig.id, signal_title: sig.title, prior_state: sig.state, queries: [], inserted: 0, error: "no queries generated" });
      continue;
    }

    let inserted = 0;
    for (const producerId of producerList) {
      try {
        const producer = getProducer(producerId);
        const packets = await producer.search({ contextId: context, queries, limit: perVariantLimit });
        for (const p of packets) {
          const r = insert.run(
            p.id, p.context_id, p.source_id, p.source_layer, p.source_item_id,
            p.url, p.title, p.body, p.author_ref, p.community, p.observed_at,
            p.published_at, p.metrics, p.topics, p.raw_ref, p.content_hash,
            p.intent, p.awareness_level, p.evidence_weight, p.quality_score,
            p.sentiment, p.evidence_state, p.source_kind
          );
          if (r.changes > 0) inserted++;
        }
      } catch (err) {
        // Continue with other producers
      }
    }

    db.prepare(`
      UPDATE signal_lifecycle
        SET research_attempts = COALESCE(research_attempts, 0) + 1,
            last_research_at = datetime('now')
      WHERE signal_id = ?
    `).run(sig.id);

    const after = db.prepare(`
      SELECT COUNT(*) AS c FROM evidence_packets WHERE context_id = ?
    `).get(context).c;

    attempts.push({
      signal_id: sig.id,
      signal_title: sig.title,
      prior_state: sig.state,
      queries,
      packets_inserted: inserted,
      context_packets_before: before,
      context_packets_after: after,
    });
  }

  return { attempts };
}
