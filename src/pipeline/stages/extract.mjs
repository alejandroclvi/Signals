/**
 * Stage 3: Extraction — signal grouping + deep extraction.
 *
 * Takes classified evidence packets and produces candidate signals
 * with deep extractions (Not X it's Y, failed solutions, etc.)
 *
 * Quality gate:
 *   - Reject: signals with < 2 weighted packets
 *   - Quality bonus: deep extractions present, multiple passes completed
 *   - Pass threshold: >= 1 signal produced
 */

import { extractSignals } from "../signal-extractor.mjs";

export function extract({ allEvidence, contextId, onProgress }) {
  if (onProgress) onProgress({ stage: "extract", message: "Extracting signals from " + allEvidence.length + " total packets..." });

  const { signals, signalEvidence } = extractSignals(allEvidence, contextId);

  // Quality gate: reject signals with < 2 weighted packets
  const before = signals.length;
  const filtered = signals.filter(signal => {
    const packetIds = signalEvidence.get(signal.id) || [];
    const packets = allEvidence.filter(ep => packetIds.includes(ep.id));
    const weightedTotal = packets.reduce((sum, ep) => sum + (ep.evidence_weight || 1.0), 0);
    return weightedTotal >= 2.0;
  });
  const rejected = before - filtered.length;

  // Compute extraction richness per signal
  let totalExtractions = 0;
  let signalsWithExtractions = 0;
  for (const signal of filtered) {
    const extCount = (signal._deepExtractions || []).length;
    totalExtractions += extCount;
    if (extCount > 0) signalsWithExtractions++;
  }

  // Clean up signalEvidence for rejected signals
  const filteredIds = new Set(filtered.map(s => s.id));
  const filteredEvidence = new Map();
  for (const [sid, eids] of signalEvidence) {
    if (filteredIds.has(sid)) filteredEvidence.set(sid, eids);
  }

  const passed = filtered.length >= 1;

  return {
    output: { signals: filtered, signalEvidence: filteredEvidence },
    stats: {
      candidateSignals: before,
      survivingSignals: filtered.length,
      gateRejected: rejected,
      totalExtractions,
      signalsWithExtractions,
      extractionRate: filtered.length > 0
        ? Math.round(signalsWithExtractions / filtered.length * 100)
        : 0,
    },
    gate: {
      passed,
      reason: passed
        ? filtered.length + " signals extracted (" + totalExtractions + " deep extractions across " + signalsWithExtractions + " signals)"
        : "No signals survived extraction gate",
    },
  };
}
