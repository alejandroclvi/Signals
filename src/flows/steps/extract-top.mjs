/**
 * Pull top-N signals for a context+lens from signal_scores, with their
 * top-weighted score components for context.
 *
 * Args: { context, lens, limit?=5 }
 * Returns: array of { id, title, total, rank, mentions, dominantState, components: [{name, weighted, raw, weight}] }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

export default async function extractTop({ context, lens = "content", limit = 5 } = {}) {
  if (!context) throw new Error("context is required");
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.id, s.title, s.mentions, s.dominant_state, s.dominant_intent,
           ss.total, ss.rank_in_ctx, ss.components
    FROM signal_scores ss
    JOIN signals s ON s.id = ss.signal_id
    WHERE s.context_id = ? AND ss.lens = ?
    ORDER BY ss.rank_in_ctx
    LIMIT ?
  `).all(context, lens, limit);

  return rows.map(r => {
    let components = [];
    try {
      const arr = JSON.parse(r.components);
      components = arr
        .filter(c => c.weighted > 0)
        .sort((a, b) => b.weighted - a.weighted)
        .slice(0, 5)
        .map(c => ({ name: c.name, weighted: c.weighted, raw: c.raw, weight: c.weight }));
    } catch { /* ignore */ }
    return {
      id: r.id,
      title: r.title,
      total: r.total,
      rank: r.rank_in_ctx,
      mentions: r.mentions,
      dominantState: r.dominant_state,
      dominantIntent: r.dominant_intent,
      components,
    };
  });
}
