/**
 * Pull signals filtered by lifecycle state(s), enriched with score components,
 * freshness, and lifecycle metadata. Replaces tier-only filtering.
 *
 * Args: { context, lens?='content', states?=['fresh','mature'], limit?=4, includeMaterialized?=true }
 * Returns: array of signal objects with lifecycle + score data
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

function safeJson(v, f) { try { return typeof v === "string" ? JSON.parse(v) : (v ?? f); } catch { return f; } }

const POS_TITLE = ["aha moment", "breakthrough", "wins", "success", "proof", "found what works", "best practices", "love", "adoption", "switching to", "switched to"];
const NEG_TITLE = ["skepticism", "frustration", "decline", "wall", "issues", "trust issues", "failure", "broken", "stop using", "wrong", "switching from", "switched from", "churn", "refund", "limit", "waste", "friction", "burn", "vs", "complaints"];
const POS_TAGS = ["adoption", "found_what_works", "promoting", "narrative_positive"];
const NEG_TAGS = ["frustration", "warning", "tried_failed", "decline"];

function valenceFor(title, tags) {
  const t = (title || "").toLowerCase();
  const tg = (tags || []).map(x => String(x).toLowerCase());
  let pos = 0, neg = 0;
  for (const p of POS_TITLE) if (t.includes(p)) pos += 2;
  for (const n of NEG_TITLE) if (t.includes(n)) neg += 2;
  for (const p of POS_TAGS) if (tg.includes(p)) pos += 1;
  for (const n of NEG_TAGS) if (tg.includes(n)) neg += 1;
  if (pos === 0 && neg === 0) return { label: "NEUTRAL", basis: "no signals matched" };
  const score = (pos - neg) / (pos + neg);
  if (score > 0.3) return { label: "POSITIVE", basis: `pos=${pos} neg=${neg}` };
  if (score < -0.3) return { label: "NEGATIVE", basis: `pos=${pos} neg=${neg}` };
  return { label: "MIXED", basis: `pos=${pos} neg=${neg}` };
}

export default async function extractByLifecycle({
  context,
  lens = "content",
  states = ["fresh", "mature"],
  limit = 4,
  includeMaterialized = true,
} = {}) {
  if (!context) throw new Error("context is required");
  const db = getDb();

  // Normalize states (handle string-CLI input)
  const stateList = Array.isArray(states)
    ? states
    : typeof states === "string"
      ? states.split(",").map(s => s.trim()).filter(Boolean)
      : [];
  if (!stateList.length) throw new Error("at least one lifecycle state required");

  const placeholders = stateList.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT s.id, s.title, s.mentions, s.dominant_state, s.dominant_intent, s.tags,
           ss.total, ss.rank_in_ctx, ss.components,
           sl.state, sl.state_reason, sl.prev_state, sl.materialized_at,
           sl.evidence_total, sl.evidence_30d, sl.evidence_7d, sl.trend_ratio,
           sl.latest_evidence_at
    FROM signals s
    JOIN signal_scores ss ON ss.signal_id = s.id AND ss.lens = ?
    LEFT JOIN signal_lifecycle sl ON sl.signal_id = s.id
    WHERE s.context_id = ?
      AND sl.state IN (${placeholders})
    ORDER BY
      CASE sl.state
        WHEN 'fresh' THEN 1
        WHEN 'emerging' THEN 2
        WHEN 'mature' THEN 3
        WHEN 'fading' THEN 4
        WHEN 'forming' THEN 5
        WHEN 'stalled' THEN 6
        ELSE 7 END,
      sl.evidence_30d DESC,
      ss.rank_in_ctx ASC
    LIMIT ?
  `).all(lens, context, ...stateList, limit);

  if (!rows.length) {
    // Diagnostic: what states ARE present?
    const dist = db.prepare(`
      SELECT sl.state, COUNT(*) AS c FROM signal_lifecycle sl
      JOIN signals s ON s.id = sl.signal_id
      WHERE s.context_id = ?
      GROUP BY sl.state
    `).all(context);
    throw new Error(
      `No signals in ${context} match lifecycle states [${stateList.join(", ")}]. ` +
      `Distribution: ${JSON.stringify(Object.fromEntries(dist.map(r => [r.state, r.c])))}. ` +
      `Try states like 'forming,emerging' if the context is still growing.`
    );
  }

  return rows.map(r => {
    const tags = safeJson(r.tags, []);
    const valence = valenceFor(r.title, tags);
    let topComponents = [];
    try {
      const arr = JSON.parse(r.components);
      topComponents = arr.filter(c => c.weighted > 0).sort((a, b) => b.weighted - a.weighted).slice(0, 5)
        .map(c => ({ name: c.name, weighted: c.weighted, raw: c.raw, weight: c.weight }));
    } catch { /* ignore */ }
    const total30 = r.evidence_total || 1;
    const share_30d = (r.evidence_30d || 0) / total30;
    return {
      id: r.id,
      title: r.title,
      total: r.total,
      rank: r.rank_in_ctx,
      mentions: r.mentions,
      dominantState: r.dominant_state,
      dominantIntent: r.dominant_intent,
      tags,
      components: topComponents,
      lifecycle: r.state,
      lifecycle_reason: r.state_reason,
      prev_state: r.prev_state,
      materialized_at: r.materialized_at,
      evidence_total: r.evidence_total,
      evidence_30d: r.evidence_30d,
      evidence_7d: r.evidence_7d,
      share_30d: Math.round(share_30d * 100) / 100,
      trend_ratio: r.trend_ratio,
      latest_at: r.latest_evidence_at?.slice(0, 10) || null,
      valence: valence.label,
      valence_basis: valence.basis,
    };
  });
}
