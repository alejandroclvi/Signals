/**
 * Lens-aware scorer — combines legacy SQLite components + graph-derived components,
 * applies per-lens weights, and materializes signal_scores rows.
 *
 * Same evidence pool, many goal-specific rankings:
 *   for each lens in lensList:
 *     for each signal:
 *       total = sum( weight[name] * raw[name] for each component )
 *     rank by total within context
 *
 * Skips graph components when Neo4j is unreachable (returns 0 for those slots).
 */

import { getDb } from "../db/connection.mjs";
import { scoreSignal } from "./scorer.mjs";
import { graphScoreComponents } from "./graph-scorer.mjs";
import { getScoringWeights, listAgentModes } from "./agent-modes.mjs";

function safeJson(v, f) {
  if (typeof v === "object" && v !== null) return v;
  try { return JSON.parse(v); } catch { return f; }
}

async function combineComponents(signal, packets) {
  const sqlite = scoreSignal(signal, packets);
  let graph = { components: [] };
  try {
    graph = await graphScoreComponents(signal.id);
  } catch { /* graph unavailable — proceed without */ }

  const map = new Map();
  for (const [name, value] of sqlite.components) map.set(name, { raw: value, meta: null });
  for (const [name, value, meta] of graph.components) map.set(name, { raw: value, meta });
  return map;
}

function applyLens(componentMap, lens) {
  const weights = getScoringWeights(lens);
  const components = [];
  let total = 0;
  for (const [name, { raw, meta }] of componentMap) {
    const w = weights[name] ?? 1.0;
    const weighted = Math.round(raw * w);
    total += weighted;
    components.push({ name, weight: w, raw, weighted, meta });
  }
  return { total, components };
}

/**
 * Score every signal in a context under every lens, persist to signal_scores,
 * and return a summary table.
 *
 * @param {string} contextId
 * @param {string[]} lenses — defaults to all 5 modes
 * @returns {{signal_id, title, scores: { lens: {total, rank}, ... }}[]}
 */
export async function scoreContextAllLenses(contextId, lenses = null) {
  const db = getDb();
  const lensList = lenses || listAgentModes().map(m => m.id);

  const signals = db.prepare(
    `SELECT * FROM signals WHERE context_id = ?`
  ).all(contextId);

  if (signals.length === 0) return [];

  const packetsBySignal = new Map();
  for (const s of signals) {
    const ev = db.prepare(`
      SELECT ep.* FROM evidence_packets ep
      JOIN signal_evidence se ON se.evidence_id = ep.id
      WHERE se.signal_id = ?
    `).all(s.id);
    packetsBySignal.set(s.id, ev);
  }

  // Compute component map once per signal (same for all lenses)
  const compMaps = new Map();
  for (const s of signals) {
    compMaps.set(s.id, await combineComponents(s, packetsBySignal.get(s.id) || []));
  }

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO signal_scores
      (signal_id, lens, total, components, rank_in_ctx, computed_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  const summary = signals.map(s => ({ signal_id: s.id, title: s.title, scores: {} }));

  for (const lens of lensList) {
    const scored = signals.map(s => ({
      signal_id: s.id,
      title: s.title,
      ...applyLens(compMaps.get(s.id), lens),
    }));
    scored.sort((a, b) => b.total - a.total);

    const tx = db.transaction(() => {
      scored.forEach((row, i) => {
        upsert.run(row.signal_id, lens, row.total, JSON.stringify(row.components), i + 1);
      });
    });
    tx();

    scored.forEach((row, i) => {
      const summaryRow = summary.find(x => x.signal_id === row.signal_id);
      summaryRow.scores[lens] = { total: row.total, rank: i + 1 };
    });
  }

  return summary;
}
