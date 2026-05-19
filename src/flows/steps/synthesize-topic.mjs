/**
 * Step: synthesize-topic.
 *
 * For each topic, calls the multi-layer-synth agent with the gathered
 * cross-layer evidence and the temporal structural hints. Returns an array
 * of synthesized topic objects ready for save-unified-brief.
 *
 * Args: { context, topics, byTopic, temporalById }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";
import { synthesizeTopic } from "../../agents/multi-layer-synth.mjs";

export default async function synthesizeTopicsStep({
  context,
  topics,
  byTopic,
  temporalById,
} = {}) {
  if (!context) throw new Error("context is required");
  if (!Array.isArray(topics) || !topics.length) return { synthesized: [] };

  const db = getDb();
  const ctxRow = db.prepare("SELECT id, label FROM contexts WHERE id = ?").get(context);
  if (!ctxRow) throw new Error(`Context not found: ${context}`);

  const synthesized = [];
  for (const t of topics) {
    const id = t.id || t.name;
    const layers = byTopic?.[id] || {};
    const evidenceCount = Object.values(layers).reduce((s, a) => s + (a?.length || 0), 0);

    if (evidenceCount === 0) {
      console.warn(`[synthesize-topic] no evidence for "${t.name}" — skipping`);
      continue;
    }

    const temporal = temporalById?.[id] || null;

    // Augment the topic prompt with the structural temporal hint so the LLM
    // has data to reason from (not just its own guess from samples).
    const topicWithTemporal = {
      ...t,
      temporal_hypothesis: temporal
        ? `${t.temporal_hypothesis || "?"} (structural: first=${temporal.first_detected}, peak=${temporal.peak_at}, breadth=${temporal.layer_breadth}/7 layers, velocity_14d_vs_60d=${temporal.velocity_14d_vs_60d}× → ${temporal.velocity_state})`
        : t.temporal_hypothesis,
    };

    try {
      const result = await synthesizeTopic({
        topic: topicWithTemporal,
        evidenceByLayer: layers,
        contextLabel: ctxRow.label,
      });
      synthesized.push({
        topic: t,
        layers,
        temporal,
        synthesis: result.synthesis,
        modelUsed: result.modelUsed,
        layerCoverage: result.layerCoverage,
      });
    } catch (err) {
      console.error(`[synthesize-topic] "${t.name}" failed:`, err.message);
    }
  }

  return { synthesized };
}
