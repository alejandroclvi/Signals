/**
 * Step: discover-topics.
 *
 * Samples high-weighted recent evidence from each layer, sends to the
 * multi-layer-synth agent in discovery mode, returns a list of topic objects.
 *
 * Args: { context, sinceDate?, maxTopics?, perLayerSample? }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";
import { discoverTopics } from "../../agents/multi-layer-synth.mjs";

const LAYERS = ["truth", "conversation", "intent", "behavior", "expectation", "economic", "capital"];

export default async function discoverTopicsStep({
  context,
  sinceDate,
  maxTopics = 8,
  perLayerSample = 12,
} = {}) {
  if (!context) throw new Error("context is required");
  const db = getDb();

  const ctxRow = db.prepare("SELECT id, label FROM contexts WHERE id = ?").get(context);
  if (!ctxRow) throw new Error(`Context not found: ${context}`);

  const cutoff = sinceDate || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const sampleByLayer = {};
  for (const layer of LAYERS) {
    const rows = db.prepare(`
      SELECT id, title, body, community, source_id, published_at, evidence_weight
      FROM evidence_packets
      WHERE context_id = ?
        AND source_layer = ?
        AND published_at >= ?
      ORDER BY evidence_weight DESC, published_at DESC
      LIMIT ?
    `).all(context, layer, cutoff, perLayerSample);
    sampleByLayer[layer] = rows;
  }

  const total = Object.values(sampleByLayer).reduce((s, arr) => s + arr.length, 0);
  if (total === 0) {
    console.warn(`[discover-topics] no evidence found in context ${context} since ${cutoff}`);
    return { topics: [], modelUsed: null };
  }

  const result = await discoverTopics({
    sampleByLayer,
    contextLabel: ctxRow.label,
    maxTopics,
  });

  return result; // { topics, modelUsed }
}
