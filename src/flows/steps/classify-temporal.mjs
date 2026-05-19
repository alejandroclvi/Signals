/**
 * Step: classify-temporal.
 *
 * For each topic + its gathered evidence, compute structural temporal hints
 * that the synthesizer will use alongside its own LLM judgement. We don't
 * make the final call here — we give the LLM the numbers (first_detected,
 * peak_at, 14d-vs-baseline velocity, layer breadth) so its temporal_state
 * decision is grounded.
 *
 * Args: { byTopic, sinceDate? }
 * Returns: { temporalById: { topicId: { first_detected, peak_at, velocity,
 *                                       layer_breadth, peak_layer } } }
 */

const LAYERS = ["truth", "conversation", "intent", "behavior", "expectation", "economic", "capital"];

function isoDay(s) { return (s || "").slice(0, 10); }

function dayBucket(packets) {
  const map = new Map();
  for (const p of packets) {
    const d = isoDay(p.published_at);
    if (!d) continue;
    map.set(d, (map.get(d) || 0) + (p.evidence_weight || 1));
  }
  return map;
}

export default async function classifyTemporalStep({ byTopic } = {}) {
  const temporalById = {};

  for (const [topicId, layers] of Object.entries(byTopic || {})) {
    const allPackets = LAYERS.flatMap(l => layers[l] || []);
    if (!allPackets.length) {
      temporalById[topicId] = {
        first_detected: null,
        peak_at: null,
        peak_layer: null,
        layer_breadth: 0,
        velocity_14d_vs_60d: 0,
        velocity_state: "no_signal",
      };
      continue;
    }

    // First detection across any layer
    const firstDetected = isoDay(
      allPackets.reduce((min, p) => {
        const d = p.published_at || "";
        return !min || d < min ? d : min;
      }, "")
    );

    // Day-by-day weighted volume (across all layers)
    const buckets = dayBucket(allPackets);
    let peakDay = null;
    let peakVal = 0;
    for (const [d, v] of buckets.entries()) {
      if (v > peakVal) { peakVal = v; peakDay = d; }
    }

    // Per-layer peak (which layer is loudest)
    let peakLayer = null;
    let peakLayerCount = 0;
    for (const layer of LAYERS) {
      const arr = layers[layer] || [];
      const w = arr.reduce((s, p) => s + (p.evidence_weight || 1), 0);
      if (w > peakLayerCount) { peakLayerCount = w; peakLayer = layer; }
    }

    // Layer breadth: how many of the 7 layers carry any evidence
    const layerBreadth = LAYERS.filter(l => (layers[l] || []).length > 0).length;

    // Velocity: last-14d packet weight vs the prior-46d window
    const today = new Date();
    const cutoff14 = new Date(today.getTime() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const cutoff60 = new Date(today.getTime() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    let last14 = 0, prior46 = 0;
    for (const p of allPackets) {
      const d = isoDay(p.published_at);
      if (!d) continue;
      const w = p.evidence_weight || 1;
      if (d >= cutoff14) last14 += w;
      else if (d >= cutoff60) prior46 += w;
    }
    // Daily-rate comparison so the 14 vs 46 day-count difference doesn't skew it
    const rate14 = last14 / 14;
    const rate46 = prior46 / 46;
    const velocity = rate46 > 0 ? rate14 / rate46 : (rate14 > 0 ? 99 : 0);

    let velocityState;
    if (velocity >= 1.5) velocityState = "rising";
    else if (velocity <= 0.6) velocityState = "fading";
    else velocityState = "stable";

    temporalById[topicId] = {
      first_detected: firstDetected || null,
      peak_at: peakDay,
      peak_layer: peakLayer,
      layer_breadth: layerBreadth,
      velocity_14d_vs_60d: Math.round(velocity * 100) / 100,
      velocity_state: velocityState,
    };
  }

  return { temporalById };
}
