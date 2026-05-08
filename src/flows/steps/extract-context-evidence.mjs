/**
 * Pull supplementary multi-source evidence for a context that isn't yet linked
 * to signals via signal_evidence (HN posts, Polymarket markets).
 *
 * Why this exists: signal extraction is currently Reddit-only — HN/PM evidence
 * is in the same context but doesn't participate in the per-signal quote join.
 * Until signals are re-extracted on combined evidence, this step surfaces those
 * sources as "broader context" so the article can cite multi-layer evidence.
 *
 * Args: { context, asOf, windowDays?=30, hnLimit?=5, pmLimit?=8 }
 * Returns: {
 *   hn: [{ title, url, community, upvotes, comments, date, body_excerpt }],
 *   polymarket: [{ market, url, probability, volume24h, end_date, body_excerpt, date }],
 * }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

function safeJson(v, f) { try { return typeof v === "string" ? JSON.parse(v) : (v ?? f); } catch { return f; } }

export default async function extractContextEvidence({ context, asOf = null, windowDays = 30, hnLimit = 5, pmLimit = 8 } = {}) {
  if (!context) throw new Error("context is required");
  const today = asOf || new Date().toISOString().slice(0, 10);
  const windowStart = new Date(new Date(today).getTime() - windowDays * 86400_000).toISOString();
  const windowEnd = today + "T23:59:59Z";

  const db = getDb();

  // Hacker News — top posts in context within window, by upvotes
  const hnRows = db.prepare(`
    SELECT id, url, title, community, body, evidence_weight, metrics, published_at
    FROM evidence_packets
    WHERE context_id = ?
      AND source_id = 'hackernews'
      AND source_kind = 'post'
      AND published_at >= ?
      AND published_at <= ?
      AND title IS NOT NULL
      AND length(title) >= 10
    ORDER BY evidence_weight DESC, published_at DESC
    LIMIT ?
  `).all(context, windowStart, windowEnd, hnLimit);

  // If none in window, fall back to most recent regardless of window
  let hnFinal = hnRows;
  if (hnFinal.length === 0) {
    hnFinal = db.prepare(`
      SELECT id, url, title, community, body, evidence_weight, metrics, published_at
      FROM evidence_packets
      WHERE context_id = ? AND source_id = 'hackernews' AND source_kind = 'post'
        AND title IS NOT NULL AND length(title) >= 10
      ORDER BY published_at DESC, evidence_weight DESC
      LIMIT ?
    `).all(context, hnLimit);
  }

  const hn = hnFinal.map(r => {
    const m = safeJson(r.metrics, {});
    let excerpt = (r.body || "").replace(/\n+/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (excerpt.length > 240) excerpt = excerpt.slice(0, 240) + "…";
    return {
      title: r.title,
      url: r.url,
      community: r.community,
      upvotes: m.points || null,
      comments: m.comments || null,
      date: r.published_at?.slice(0, 10),
      body_excerpt: excerpt || r.title,
    };
  });

  // Polymarket — current market snapshots in this context (most recent record per market)
  const pmRows = db.prepare(`
    SELECT id, url, title, body, metrics, evidence_state, evidence_weight, published_at
    FROM evidence_packets
    WHERE context_id = ? AND source_id = 'polymarket'
    ORDER BY evidence_weight DESC, published_at DESC
    LIMIT ?
  `).all(context, pmLimit);

  const pm = pmRows.map(r => {
    const m = safeJson(r.metrics, {});
    let excerpt = (r.body || "").replace(/\n+/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (excerpt.length > 200) excerpt = excerpt.slice(0, 200) + "…";
    return {
      market: r.title,
      url: r.url,
      probability: m.probability,
      volume24h: m.volume24h,
      liquidity: m.liquidity,
      end_date: m.end_date,
      state: r.evidence_state,
      date: r.published_at?.slice(0, 10),
      body_excerpt: excerpt,
    };
  });

  return { hn, polymarket: pm, window_start: windowStart.slice(0, 10), window_end: today };
}
