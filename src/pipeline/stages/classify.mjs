/**
 * Stage 2: Classification — intent, awareness, evidence weighting, and
 * community relevance filtering.
 *
 * Quality gate:
 *   - Reject: body < 20 chars, pure link-only, irrelevant communities
 *   - Quality bonus: clear intent match, relevant community, high awareness
 *   - Pass threshold: >= 60% of collected packets survive
 */

import { communityRelevance } from "../community-relevance.mjs";

export function classify({ evidencePackets, onProgress }) {
  if (onProgress) onProgress({ stage: "classify", message: "Classifying " + evidencePackets.length + " packets..." });

  const before = evidencePackets.length;

  // Compute quality scores for each packet
  const scored = evidencePackets.map(ep => {
    let quality = 0.5;

    // Community relevance
    const relevance = communityRelevance(ep.community);
    quality = quality * relevance + relevance * 0.3;

    // Intent clarity
    const text = ((ep.title || "") + " " + (ep.body || "")).toLowerCase();
    const hasQuestionMark = text.includes("?");
    if (ep.intent !== "question" || hasQuestionMark) quality += 0.1;

    // Awareness specificity
    if (ep.awareness_level === "product_aware" || ep.awareness_level === "most_aware") quality += 0.1;
    if (ep.awareness_level === "solution_aware") quality += 0.05;

    // Evidence weight (upvote validation)
    quality += Math.min(0.15, (ep.evidence_weight - 1.0) * 0.15);

    // Body length
    const bodyLen = (ep.body || "").length;
    if (bodyLen > 200) quality += 0.05;
    if (bodyLen > 500) quality += 0.05;

    return { ...ep, quality_score: Math.min(1.0, Math.round(quality * 100) / 100) };
  });

  // Gate: reject low-quality and irrelevant
  const filtered = scored.filter(ep => {
    if (!ep.body || ep.body.trim().length < 20) return false;
    if (/^https?:\/\/\S+$/.test(ep.body.trim())) return false;
    // Drop evidence from clearly irrelevant communities
    if (communityRelevance(ep.community) <= 0.1) return false;
    return true;
  });

  const rejected = before - filtered.length;
  const survivalRate = before > 0 ? filtered.length / before : 1;
  const passed = survivalRate >= 0.3 || filtered.length >= 3;

  if (onProgress && rejected > 0) {
    onProgress({ stage: "classify", message: "Filtered " + rejected + " irrelevant/low-quality packets (" + filtered.length + " remaining)" });
  }

  return {
    output: { evidencePackets: filtered },
    stats: {
      input: before,
      classified: filtered.length,
      gateRejected: rejected,
      survivalRate: Math.round(survivalRate * 100),
      avgQuality: filtered.length > 0
        ? Math.round(filtered.reduce((s, ep) => s + ep.quality_score, 0) / filtered.length * 100) / 100
        : 0,
    },
    gate: {
      passed,
      reason: passed
        ? filtered.length + " packets classified (" + Math.round(survivalRate * 100) + "% survival, " + rejected + " noise filtered)"
        : "Only " + Math.round(survivalRate * 100) + "% survived classification gate (need >= 30%)",
    },
  };
}
