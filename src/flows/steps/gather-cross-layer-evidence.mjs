/**
 * Step: gather-cross-layer-evidence.
 *
 * For each topic (from discover-topics), pull matching evidence from all 7
 * layers using the topic's `key_terms` as the matcher. Returns:
 *   { topicId: { layer: [packets...], … } }
 *
 * Matching: a packet matches a topic if its title+body contains at least
 * minTermMatches of the topic's key_terms (case-insensitive, word-boundary).
 *
 * Args: { context, topics, sinceDate?, perLayerCap?, minTermMatches? }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

const LAYERS = ["truth", "conversation", "intent", "behavior", "expectation", "economic", "capital"];

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function buildMatcher(keyTerms) {
  if (!keyTerms?.length) return () => false;
  const patterns = keyTerms.map(t => new RegExp(`\\b${escapeRegex(t)}\\b`, "i"));
  return (text) => {
    const t = text || "";
    let hits = 0;
    for (const p of patterns) if (p.test(t)) hits++;
    return hits;
  };
}

export default async function gatherStep({
  context,
  topics,
  sinceDate,
  perLayerCap = 15,
  minTermMatches = 1,
} = {}) {
  if (!context) throw new Error("context is required");
  if (!Array.isArray(topics) || !topics.length) {
    return { byTopic: {}, totals: { topics: 0, matches: 0 } };
  }

  const db = getDb();
  const cutoff = sinceDate || new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // Pull every layer's evidence once into memory, then filter per topic.
  // (Cheaper than N×layer DB calls when we have small layers but many topics.)
  const evByLayer = {};
  for (const layer of LAYERS) {
    evByLayer[layer] = db.prepare(`
      SELECT id, title, body, url, community, source_id, source_kind,
             published_at, evidence_weight, evidence_state, metrics
      FROM evidence_packets
      WHERE context_id = ?
        AND source_layer = ?
        AND published_at >= ?
    `).all(context, layer, cutoff);
  }

  const byTopic = {};
  let totalMatches = 0;

  for (const t of topics) {
    const id = t.id || t.name; // topic id may be set upstream; otherwise name acts as id
    const matcher = buildMatcher(t.key_terms || []);
    byTopic[id] = {};
    for (const layer of LAYERS) {
      const matches = [];
      for (const ep of evByLayer[layer]) {
        const hits = matcher(`${ep.title || ""} ${ep.body || ""}`);
        if (hits >= minTermMatches) matches.push({ ...ep, _hits: hits });
      }
      // Rank by hit count * evidence_weight, take top N
      matches.sort((a, b) => (b._hits * (b.evidence_weight || 1)) - (a._hits * (a.evidence_weight || 1)));
      byTopic[id][layer] = matches.slice(0, perLayerCap).map(({ _hits, ...rest }) => rest);
      totalMatches += byTopic[id][layer].length;
    }
  }

  return { byTopic, totals: { topics: topics.length, matches: totalMatches } };
}
