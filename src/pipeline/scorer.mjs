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

  // 1. Repetition — weighted evidence support (crowd-validated comments count more)
  const weightedSum = evidencePackets.reduce((sum, ep) => sum + (ep.evidence_weight || 1.0), 0);
  const repetition = Math.min(100, Math.round(weightedSum * 4.3));

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

  // 5. Engagement quality — weighted engagement (high-upvote comments boost this)
  const weightedEngagement = evidencePackets.reduce((sum, ep) => {
    const m = safeParseJson(ep.metrics, {});
    const w = ep.evidence_weight || 1.0;
    return sum + (m.comments || 0) * w;
  }, 0);
  const engagementQuality = Math.min(100, Math.round(weightedEngagement / Math.max(1, signal.mentions) * 3));

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

  // 10. Insight depth — deep extraction patterns found
  const extractions = signal._deepExtractions || [];
  const notXitsY = extractions.filter(e => e.extraction_type === "not_x_its_y").length;
  const identityCount = extractions.filter(e => e.extraction_type === "identity_statement").length;
  const insightDepth = Math.min(100, extractions.length * 12 + notXitsY * 20 + identityCount * 20);

  // 11. Solution gap — failed solutions with community validation
  const failedSols = extractions.filter(e => e.extraction_type === "failed_solution");
  const failedValidation = failedSols.reduce((sum, e) => sum + (e.upvotes || 0), 0);
  const solutionGap = Math.min(100, failedSols.length * 20 + Math.round(failedValidation / 10));

  // 12. Thread intelligence — bonus for LLM-analyzed threads with confirmed findings
  const threadIntel = getThreadIntelForSignal(signal, evidencePackets);
  const threadIntelScore = computeThreadIntelScore(threadIntel);

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
    ["Insight depth", insightDepth],
    ["Solution gap", solutionGap],
    ["Thread intelligence", threadIntelScore],
  ];

  const total = components.reduce((sum, c) => sum + c[1], 0);

  return { components, total };
}

/**
 * Query thread intelligence linked to a signal's evidence packets.
 */
function getThreadIntelForSignal(signal, evidencePackets) {
  const db = getDb();
  const threadIds = [...new Set(evidencePackets.map(ep => ep.thread_id).filter(Boolean))];
  if (threadIds.length === 0) return [];

  const placeholders = threadIds.map(() => "?").join(",");
  return db.prepare(
    `SELECT * FROM thread_intelligence WHERE thread_id IN (${placeholders})`
  ).all(...threadIds);
}

/**
 * Compute thread intelligence score (0-100).
 * - Each analyzed thread with signal_quality "high" contributes heavily
 * - "confirmed" confidence tier gets 1.5x multiplier
 * - not_x_its_y findings are the most valuable
 */
function computeThreadIntelScore(intels) {
  if (intels.length === 0) return 0;

  let score = 0;

  for (const ti of intels) {
    const quality = ti.signal_quality || "low";
    const tier = ti.confidence_tier || "llm_only";
    const tierMultiplier = tier === "confirmed" ? 1.5 : 1.0;

    // Base score by quality
    let base = 0;
    if (quality === "high") base = 20;
    else if (quality === "medium") base = 12;
    else if (quality === "low") base = 5;
    // noise = 0

    // Bonus for not_x_its_y findings
    const nxy = safeParseJson(ti.not_x_its_y, []);
    base += nxy.length * 8;

    // Bonus for failed solutions
    const failed = safeParseJson(ti.failed_solutions, []);
    base += failed.length * 5;

    score += base * tierMultiplier;
  }

  return Math.min(100, Math.round(score));
}

/**
 * Update signal confidence based on score.
 */
export function confidenceFromScore(total) {
  if (total >= 450) return "High";
  if (total >= 300) return "Medium";
  return "Low";
}
