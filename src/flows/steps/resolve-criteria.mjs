/**
 * Resolve engagement criteria into a structured form usable by downstream
 * steps. Two input modes:
 *
 *   1. Free-text:  { criteria: "founders frustrated with Claude Code cost" }
 *   2. Signal-id:  { signalId: "live:cost-management", context: "..." }
 *      → reads the signal title + tags from SQLite, derives criteria
 *
 * Returns: { criteria, keywords: string[], topic_summary }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

const MODEL = "google/gemini-2.0-flash-001";

function safeJson(v, f) { try { return typeof v === "string" ? JSON.parse(v) : (v ?? f); } catch { return f; } }

async function llmExpand(seed, apiKey, niche) {
  const prompt = `You are extracting LinkedIn-search-friendly metadata for an engagement radar — finding LinkedIn posts to engage with.

SEED: ${seed}
${niche ? `NICHE / DOMAIN: ${niche}\n` : ""}
Important: keywords must reflect the EXACT niche from the seed. Don't drift to generic interpretations — if the seed mentions "claude code", don't return "Cloud Cost Optimization"; return things like "Claude Code", "AI coding agents", "developer tooling cost", "indie hacker AI".

Return ONLY JSON, no preamble:
{
  "keywords": [3-5 short keyword strings used for LinkedIn people-search. Should match the niche EXACTLY. Examples that are good: "Claude Code", "AI coding agents", "developer tooling spend". Examples that are bad: "Cloud Cost Optimization", "FinOps Engineer" (unless the seed is genuinely about FinOps).],
  "topic_summary": "One sentence in the niche's voice — used as the criteria for filtering posts. Should mention the specific products/tools/audience, not generic concepts."
}`;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  try {
    return JSON.parse(json.choices?.[0]?.message?.content || "{}");
  } catch {
    return {};
  }
}

export default async function resolveCriteria({ criteria = "", signalId = "", context = "" } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  let seed = criteria;
  let signalMeta = null;

  let niche = null;

  if (signalId) {
    if (!context) throw new Error("context is required when signalId is supplied");
    const db = getDb();
    const sig = db.prepare(`
      SELECT s.id, s.title, s.tags,
             sl.state, sl.evidence_30d, sl.evidence_7d
      FROM signals s
      LEFT JOIN signal_lifecycle sl ON sl.signal_id = s.id
      WHERE s.id = ? AND s.context_id = ?
    `).get(signalId, context);
    if (!sig) throw new Error(`Signal not found: ${signalId} in ${context}`);
    // Pull a few representative quotes — gives the LLM real niche grounding
    const quotes = db.prepare(`
      SELECT ep.body, ep.community FROM evidence_packets ep
      JOIN signal_evidence se ON se.evidence_id = ep.id
      WHERE se.signal_id = ?
        AND ep.body IS NOT NULL AND length(ep.body) >= 100
      ORDER BY ep.evidence_weight DESC LIMIT 3
    `).all(signalId);
    const ctxRow = db.prepare(`SELECT label FROM contexts WHERE id = ?`).get(context);
    const tags = safeJson(sig.tags, []);
    signalMeta = {
      title: sig.title,
      tags,
      state: sig.state,
      evidence_30d: sig.evidence_30d,
      evidence_7d: sig.evidence_7d,
    };
    seed = `${sig.title}. tags: ${tags.join(", ")}. lifecycle: ${sig.state || "unknown"}; recent activity: ${sig.evidence_7d || 0}/7d, ${sig.evidence_30d || 0}/30d.${quotes.length ? "\n\nRepresentative quotes from the signal's evidence pool:\n" + quotes.map(q => `  • (${q.community}) "${q.body.replace(/\s+/g," ").slice(0, 220)}…"`).join("\n") : ""}`;
    niche = ctxRow?.label || context;
  }

  if (!seed) throw new Error("Either --criteria or --signalId is required");

  const expanded = await llmExpand(seed, apiKey, niche);
  return {
    criteria: seed,
    keywords: Array.isArray(expanded.keywords) ? expanded.keywords.slice(0, 5) : [],
    topic_summary: expanded.topic_summary || seed,
    signal: signalMeta,
  };
}
