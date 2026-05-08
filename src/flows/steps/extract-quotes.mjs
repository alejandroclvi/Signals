/**
 * Pull the strongest quotable evidence per signal — body excerpt + URL + community + upvote weight.
 *
 * FRESHNESS-AWARE: prefers evidence within the window (default 30 days). Falls back to
 * older only if not enough recent. Every quote is tagged with date and `in_window` flag.
 *
 * Args: { context, signalIds: string[], perSignal?=3, asOf?=today, windowDays?=30 }
 * Returns: array of { signal_id, signal_title, quotes: [{ body, url, community, author, weight,
 *                                                          source, kind, date, in_window }] }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

function safeJson(v, f) { try { return typeof v === "string" ? JSON.parse(v) : (v ?? f); } catch { return f; } }

export default async function extractQuotes({ context, signalIds = [], perSignal = 3, asOf = null, windowDays = 30 } = {}) {
  if (!context) throw new Error("context is required");
  if (!signalIds.length) return [];

  // Accept either ["id1","id2"] or [{id:"id1"}, {id:"id2"}]
  const ids = signalIds.map(x => typeof x === "string" ? x : x?.id).filter(Boolean);
  if (!ids.length) return [];

  const today = asOf || new Date().toISOString().slice(0, 10);
  const windowStart = new Date(new Date(today).getTime() - windowDays * 86400_000).toISOString();
  const windowEnd = today + "T23:59:59Z";

  const db = getDb();
  const out = [];

  // First pull recent quotes within window, ordered by upvote weight
  const recentSql = `
    SELECT ep.id, ep.url, ep.body, ep.community, ep.author_ref, ep.evidence_weight,
           ep.source_id, ep.source_kind, ep.metrics, ep.published_at
    FROM evidence_packets ep
    JOIN signal_evidence se ON se.evidence_id = ep.id
    WHERE se.signal_id = ?
      AND ep.body IS NOT NULL
      AND length(ep.body) >= 120
      AND ep.url IS NOT NULL
      AND ep.published_at >= ?
      AND ep.published_at <= ?
    ORDER BY ep.evidence_weight DESC, ep.published_at DESC
    LIMIT ?
  `;

  // Fall-back: any high-weight quote, sorted by date desc to prefer newer-old
  const fallbackSql = `
    SELECT ep.id, ep.url, ep.body, ep.community, ep.author_ref, ep.evidence_weight,
           ep.source_id, ep.source_kind, ep.metrics, ep.published_at
    FROM evidence_packets ep
    JOIN signal_evidence se ON se.evidence_id = ep.id
    WHERE se.signal_id = ?
      AND ep.body IS NOT NULL
      AND length(ep.body) >= 120
      AND ep.url IS NOT NULL
      AND ep.published_at < ?
      AND ep.id NOT IN (SELECT id FROM evidence_packets WHERE published_at >= ? AND published_at <= ?)
    ORDER BY ep.published_at DESC, ep.evidence_weight DESC
    LIMIT ?
  `;

  for (const signalId of ids) {
    const signal = db.prepare(`SELECT id, title FROM signals WHERE id = ?`).get(signalId);
    if (!signal) continue;

    const recent = db.prepare(recentSql).all(signalId, windowStart, windowEnd, perSignal);
    let rows = recent.map(r => ({ ...r, in_window: true }));

    if (rows.length < perSignal) {
      const need = perSignal - rows.length;
      const older = db.prepare(fallbackSql).all(signalId, windowStart, windowStart, windowEnd, need)
        .map(r => ({ ...r, in_window: false }));
      rows = rows.concat(older);
    }

    const quotes = rows.map(r => {
      const m = safeJson(r.metrics, {});
      // Trim body — keep punchy sentences, not paragraphs
      let body = r.body
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&#x[0-9A-F]+;/gi, "")
        .trim();
      if (body.length > 280) body = body.slice(0, 280) + "…";
      return {
        body,
        url: r.url,
        community: r.community,
        author: r.author_ref,
        weight: r.evidence_weight,
        upvotes: m.points || m.score || null,
        source: r.source_id,
        kind: r.source_kind,
        date: r.published_at?.slice(0, 10),
        in_window: r.in_window,
      };
    });

    out.push({ signal_id: signalId, signal_title: signal.title, quotes, window_start: windowStart.slice(0, 10), window_end: today });
  }

  return out;
}
