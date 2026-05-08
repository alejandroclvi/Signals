/**
 * LLM-verifier link — Phase 2 of incremental linking.
 *
 * Catches semantic matches the keyword linker misses ("burning credits" →
 * "Cost Management" signal even though no shared keyword). Pre-filters to
 * "near-miss" candidates (evidence with exactly 1 title-token match — already
 * close, Phase 1 just needed 2), then batches LLM calls per signal.
 *
 * Skips Polymarket evidence (synthesized bodies don't fit signal narratives).
 *
 * Cost: ~$0.07 per run on a 23-signal context with ~250 unlinked evidence.
 * Run periodically (not in weekly-cadence by default).
 */

import "../lib/env.mjs";
import { getDb } from "../db/connection.mjs";

const MODEL = "google/gemini-2.0-flash-001";
const BATCH_SIZE = 8;

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","for","in","on","with","by","my","your","our",
  "this","that","these","those","is","are","be","been","being","have","has","had",
  "do","does","did","will","would","can","could","should","was","were","but","not",
  "no","yes","ok","okay","also","just","too","more","less","many","much","very",
  "really","well","get","got","gets","getting","like","see","seen","from","into",
  "as","at","it","its","i","you","we","they","he","she","them","us","me","him","her",
  "all","any","some","one","two","three","new","other","first","last","best","most",
  "ever","still","yet","actually","probably","maybe","seems","seem","every","each",
  "what","when","where","why","how","which","who","whom","there","here","claude","code",
]);

function tokenize(text) {
  if (!text) return new Set();
  return new Set(
    String(text).toLowerCase().replace(/[^\w\s'-]/g, " ").split(/\s+/)
      .filter(t => t.length >= 3 && !STOPWORDS.has(t))
  );
}

function titlePrefixTokens(title) {
  const prefix = title.includes(":") ? title.split(":")[0] : title;
  return tokenize(prefix);
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function callVerifier(signal, candidates, apiKey) {
  const candidateBlock = candidates.map((c, i) =>
    `[${i + 1}] (${c.community || c.source_id}, ${c.published_at?.slice(0, 10) || "?"}) "${(c.body || c.title || "").slice(0, 280).replace(/\s+/g, " ")}"`
  ).join("\n");

  const prompt = `You are matching evidence to a signal — deciding whether each candidate post/comment is about the same specific topic as the signal.

SIGNAL: "${signal.title}"
${signal.facetQuotes ? `Sample quotes from this signal:\n${signal.facetQuotes}` : ""}

CANDIDATES:
${candidateBlock}

For each candidate, return one of:
  "yes"   — clearly about the same specific topic
  "no"    — about a different topic
  "maybe" — adjacent or unclear

Be conservative. Only "yes" if the candidate clearly belongs to THIS specific signal, not just the general domain. Two posts about Claude Code in general don't both belong to "Cost Management" unless they're specifically about cost.

Return ONLY valid JSON, no preamble:
{"matches":[{"id":1,"verdict":"yes|no|maybe"}, ...]}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim() || "{}";
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.matches) ? parsed.matches : [];
  } catch {
    return [];
  }
}

function getSignalFacetQuotes(db, signalId, perSignal = 2) {
  // Pull a couple of strongly-validated quotes already linked to the signal — used as "what does this signal sound like" context for the LLM.
  const rows = db.prepare(`
    SELECT ep.body, ep.community
    FROM evidence_packets ep
    JOIN signal_evidence se ON se.evidence_id = ep.id
    WHERE se.signal_id = ?
      AND ep.body IS NOT NULL
      AND length(ep.body) >= 100
    ORDER BY ep.evidence_weight DESC
    LIMIT ?
  `).all(signalId, perSignal);
  if (!rows.length) return null;
  return rows.map(r => `  - (${r.community}) "${r.body.replace(/\s+/g, " ").slice(0, 200)}…"`).join("\n");
}

export async function llmVerifyLinks(contextId, options = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const db = getDb();
  const excludeSources = options.excludeSources || ["polymarket"];
  const acceptVerdicts = new Set(options.acceptVerdicts || ["yes"]);
  const maxCandidatesPerSignal = options.maxCandidatesPerSignal || 24;

  const signals = db.prepare(`SELECT id, title FROM signals WHERE context_id = ?`).all(contextId);
  if (!signals.length) return { inserted: 0, signalsConsidered: 0, llmCalls: 0 };

  // Annotate signals with title tokens
  const signalsAnnotated = signals.map(s => ({
    ...s,
    titleTokens: titlePrefixTokens(s.title),
    facetQuotes: getSignalFacetQuotes(db, s.id),
  })).filter(s => s.titleTokens.size > 0);

  // Pull unlinked evidence (exclude polymarket by default)
  const placeholders = excludeSources.map(() => "?").join(",");
  const unlinked = db.prepare(`
    SELECT ep.id, ep.title, ep.body, ep.source_id, ep.community, ep.published_at
    FROM evidence_packets ep
    WHERE ep.context_id = ?
      AND ep.id NOT IN (SELECT evidence_id FROM signal_evidence)
      ${excludeSources.length ? `AND ep.source_id NOT IN (${placeholders})` : ""}
  `).all(contextId, ...excludeSources);

  if (!unlinked.length) {
    return { inserted: 0, signalsConsidered: signalsAnnotated.length, candidatesConsidered: 0, llmCalls: 0, sample: [] };
  }

  // Group candidates per signal — only include "near-miss" matches
  const candidatesPerSignal = new Map();
  for (const ev of unlinked) {
    const evTokens = tokenize(`${ev.title || ""} ${ev.body || ""}`);
    if (evTokens.size === 0) continue;
    for (const sig of signalsAnnotated) {
      let matches = 0;
      for (const t of sig.titleTokens) if (evTokens.has(t)) matches++;
      if (matches === 1) {  // near-miss only — Phase 1 needs ≥2
        if (!candidatesPerSignal.has(sig.id)) candidatesPerSignal.set(sig.id, []);
        candidatesPerSignal.get(sig.id).push(ev);
      }
    }
  }

  // Cap candidates per signal (cost protection)
  for (const [sigId, list] of candidatesPerSignal) {
    if (list.length > maxCandidatesPerSignal) {
      candidatesPerSignal.set(sigId, list.slice(0, maxCandidatesPerSignal));
    }
  }

  const insert = db.prepare(`INSERT OR IGNORE INTO signal_evidence (signal_id, evidence_id) VALUES (?, ?)`);
  let inserted = 0;
  let llmCalls = 0;
  let candidatesConsidered = 0;
  const sample = [];

  for (const sig of signalsAnnotated) {
    const candidates = candidatesPerSignal.get(sig.id);
    if (!candidates?.length) continue;
    candidatesConsidered += candidates.length;
    const batches = chunk(candidates, BATCH_SIZE);
    for (const batch of batches) {
      let verdicts;
      try {
        verdicts = await callVerifier(sig, batch, apiKey);
        llmCalls++;
      } catch (err) {
        console.error(`[llm-linker] verifier error for ${sig.id}: ${err.message}`);
        continue;
      }
      const acceptedThisBatch = [];
      for (const v of verdicts) {
        const idx = (v.id || 0) - 1;
        if (idx < 0 || idx >= batch.length) continue;
        if (!acceptVerdicts.has(v.verdict)) continue;
        const ev = batch[idx];
        const r = insert.run(sig.id, ev.id);
        if (r.changes > 0) {
          inserted++;
          acceptedThisBatch.push(ev);
          if (sample.length < 8) {
            sample.push({
              signal_id: sig.id,
              signal_title: sig.title,
              evidence_id: ev.id,
              source: ev.source_id,
              community: ev.community,
              excerpt: (ev.body || ev.title || "").slice(0, 140).replace(/\s+/g, " "),
            });
          }
        }
      }
    }
  }

  return {
    inserted,
    signalsConsidered: signalsAnnotated.length,
    candidatesConsidered,
    llmCalls,
    sample,
  };
}
