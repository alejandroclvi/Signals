/**
 * Scorer — transparent heuristic scoring for candidate signals.
 *
 * Each component is a named function returning 0-100.
 * The total is the sum of weighted components.
 * Every score is explainable through its label and value.
 */

import { getDb } from "../db/connection.mjs";

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Score a signal and return an array of [label, value] components.
 */
export function scoreSignal(signal, evidencePackets) {
  const tags = safeParseJson(signal.tags, []);
  const communities = safeParseJson(signal.communities, []);

  // 1. Repetition — how many evidence packets support this signal
  const repetition = Math.min(100, Math.round(signal.mentions * 4.3));

  // 2. Pain intensity — presence of frustration/demand language
  let painIntensity = 62;
  if (tags.includes("frustration")) painIntensity = 82;
  else if (tags.includes("demand")) painIntensity = 74;

  // 3. Cross-community spread
  const crossCommunity = Math.min(100, communities.length * 24);

  // 4. Tool/solution request — phrase density indicating actionable need
  const phrases = signal._phrases || [];
  const phraseWeight = phrases.reduce((sum, p) => sum + p[1], 0);
  const toolRequest = Math.min(100, Math.round(phraseWeight / 1.7));

  // 5. Engagement quality — comment depth relative to mentions
  const engagementQuality = Math.min(100, Math.round(signal.comments / Math.max(1, signal.mentions) * 4));

  // 6. Freshness — recency of evidence
  let freshness = 72;
  if (evidencePackets.length) {
    const now = Date.now();
    const ages = evidencePackets.map(ep => {
      const pub = ep.published_at ? new Date(ep.published_at).getTime() : now;
      return (now - pub) / 86400000; // days
    });
    const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
    freshness = Math.max(20, Math.min(100, Math.round(100 - avgAge * 3)));
  }

  // 7. Missing evidence penalty — how many evidence layers are covered
  const db = getDb();
  const totalLayers = db.prepare("SELECT COUNT(*) as c FROM evidence_layers").get().c;
  const coveredLayers = new Set(evidencePackets.map(ep => ep.source_layer).filter(Boolean));
  const missingPenalty = Math.max(8, Math.round(78 - coveredLayers.size * (70 / totalLayers)));

  // 8. Author diversity — unique authors relative to mentions
  const authors = new Set(evidencePackets.map(ep => ep.author_ref).filter(Boolean));
  const authorDiversity = Math.min(100, Math.round(authors.size / Math.max(1, signal.mentions) * 100));

  // 9. Signal quality — bonus for pain/question, penalty for promotion
  const dominantIntent = signal.dominant_intent || "question";
  let signalQuality = 50;
  if (dominantIntent === "pain") signalQuality = 80;
  else if (dominantIntent === "question") signalQuality = 60;
  else if (dominantIntent === "comparison") signalQuality = 65;
  else if (dominantIntent === "insight") signalQuality = 50;
  else if (dominantIntent === "promotion") signalQuality = 20;

  const components = [
    ["Repetition", repetition],
    ["Pain intensity", painIntensity],
    ["Cross-community", crossCommunity],
    ["Tool request", toolRequest],
    ["Engagement quality", engagementQuality],
    ["Freshness", freshness],
    ["Author diversity", authorDiversity],
    ["Signal quality", signalQuality],
    ["Missing evidence penalty", missingPenalty],
  ];

  const total = components.reduce((sum, c) => sum + c[1], 0);

  return { components, total };
}

/**
 * Update signal confidence based on score.
 */
export function confidenceFromScore(total) {
  if (total >= 450) return "High";
  if (total >= 300) return "Medium";
  return "Low";
}
