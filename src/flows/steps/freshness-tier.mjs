/**
 * Compute per-signal freshness metadata for a context.
 *
 * Tier scale (calibrated against the real corpus):
 *   5 — this week:   last_7d_count  ≥ 10 AND last_7d_share  ≥ 0.10
 *   4 — this month:  last_30d_count ≥ 15 AND last_30d_share ≥ 0.15
 *   3 — recent:      last_30d_count ≥ 5
 *   2 — lagging:     last_30d_count ≥ 1
 *   1 — stale:       0 in last 30 days
 *
 * Args: { context, asOf?=today }
 * Returns: array of { signal_id, signal_title, total, last_7d, last_30d,
 *                     share_7d, share_30d, latest_at, tier, tier_label }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

const TIER_LABEL = { 5: "this-week", 4: "this-month", 3: "recent", 2: "lagging", 1: "stale" };

function computeTier({ last_7d_count, last_7d_share, last_30d_count, last_30d_share }) {
  if (last_7d_count >= 10 && last_7d_share >= 0.10) return 5;
  if (last_30d_count >= 15 && last_30d_share >= 0.15) return 4;
  if (last_30d_count >= 5) return 3;
  if (last_30d_count >= 1) return 2;
  return 1;
}

export default async function freshnessTier({ context, asOf = null } = {}) {
  if (!context) throw new Error("context is required");
  const today = asOf || new Date().toISOString().slice(0, 10);
  const db = getDb();

  const rows = db.prepare(`
    SELECT s.id AS signal_id, s.title AS signal_title,
           COUNT(ep.id) AS total,
           SUM(CASE WHEN ep.published_at >= datetime(?, '-7 days')
                     AND ep.published_at <= datetime(?, '+1 day') THEN 1 ELSE 0 END) AS last_7d,
           SUM(CASE WHEN ep.published_at >= datetime(?, '-30 days')
                     AND ep.published_at <= datetime(?, '+1 day') THEN 1 ELSE 0 END) AS last_30d,
           MAX(ep.published_at) AS latest_at
    FROM signals s
    LEFT JOIN signal_evidence se ON se.signal_id = s.id
    LEFT JOIN evidence_packets ep ON ep.id = se.evidence_id
    WHERE s.context_id = ?
    GROUP BY s.id, s.title
  `).all(today, today, today, today, context);

  return rows.map(r => {
    const total = r.total || 0;
    const share_7d = total > 0 ? r.last_7d / total : 0;
    const share_30d = total > 0 ? r.last_30d / total : 0;
    const tier = computeTier({
      last_7d_count: r.last_7d,
      last_7d_share: share_7d,
      last_30d_count: r.last_30d,
      last_30d_share: share_30d,
    });
    return {
      signal_id: r.signal_id,
      signal_title: r.signal_title,
      total,
      last_7d: r.last_7d,
      last_30d: r.last_30d,
      share_7d: Math.round(share_7d * 100) / 100,
      share_30d: Math.round(share_30d * 100) / 100,
      latest_at: r.latest_at?.slice(0, 10) || null,
      tier,
      tier_label: TIER_LABEL[tier],
    };
  });
}
