/**
 * Stage 4: Validation — scoring + quality gates.
 *
 * Scores each signal with the transparent component system,
 * computes per-evidence quality_score, and rejects noise.
 *
 * Quality gate:
 *   - Reject: signals scoring below 150 (noise floor)
 *   - Quality bonus: cross-community evidence + deep extractions
 *   - All surviving signals must have explainable scores
 */

import { scoreSignal, confidenceFromScore } from "../scorer.mjs";

export function validate({ signals, signalEvidence, allEvidence, onProgress }) {
  if (onProgress) onProgress({ stage: "validate", message: "Scoring " + signals.length + " signals..." });

  // Score all signals
  for (const signal of signals) {
    const packetIds = signalEvidence.get(signal.id) || [];
    const packets = allEvidence.filter(ep => packetIds.includes(ep.id));
    const { components, total } = scoreSignal(signal, packets);
    signal.confidence = confidenceFromScore(total);
    signal._scoreComponents = components;
    signal._scoreTotal = total;
  }

  // Quality gate: reject signals below noise floor
  const NOISE_FLOOR = 150;
  const before = signals.length;
  const filtered = signals.filter(s => s._scoreTotal >= NOISE_FLOOR);
  const rejected = before - filtered.length;

  // Re-rank filtered signals
  filtered.sort((a, b) => b._scoreTotal - a._scoreTotal);
  filtered.forEach((s, i) => { s.rank = i + 1; });

  // Compute validation stats
  const avgScore = filtered.length > 0
    ? Math.round(filtered.reduce((s, sig) => s + sig._scoreTotal, 0) / filtered.length)
    : 0;
  const highConfCount = filtered.filter(s => s.confidence === "High").length;

  const passed = filtered.length >= 1 || before === 0;

  return {
    output: { signals: filtered, signalEvidence },
    stats: {
      scored: before,
      validated: filtered.length,
      gateRejected: rejected,
      avgScore,
      highConfidence: highConfCount,
      noiseFloor: NOISE_FLOOR,
    },
    gate: {
      passed,
      reason: passed
        ? filtered.length + " signals validated (avg score " + avgScore + ", " + highConfCount + " high-confidence, " + rejected + " below noise floor)"
        : "All " + before + " signals scored below noise floor (" + NOISE_FLOOR + ")",
    },
  };
}
