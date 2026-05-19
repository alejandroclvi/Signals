/**
 * Pull top-weighted POSTS (with full body + url + community) directly from
 * evidence_packets — bypassing the signal-aggregate table. This is the input
 * shape a quote-driven LinkedIn / article draft actually needs.
 *
 * Args:
 *   context: required
 *   limit: default 12 (top N by evidence_weight × engagement)
 *   sinceDate: ISO date, default 30 days back
 *   minBodyLen: skip posts whose body is shorter than this, default 80
 *   onlyPosts: default true — filter out comments (source_kind = "comment")
 *   keywords: optional regex string (e.g. "betray|quota|switch|cancelled")
 *             to bias toward posts matching one of these terms in title or body
 *
 * Returns: array of {
 *   id, title, body, url, community, source_id, published_at,
 *   weight, score, comments, intent
 * }
 *
 * Ranking: composite score = weight × log10(reddit_score + 10) + 0.5 × keyword_match
 * where keyword_match is 1 if any keyword matches title or body, else 0.
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

function safeJson(v, fallback) {
  if (typeof v === "object" && v !== null) return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

export default async function extractTopPosts({
  context,
  limit = 12,
  sinceDate,
  minBodyLen = 80,
  onlyPosts = true,
  keywords,
} = {}) {
  if (!context) throw new Error("context is required");

  const db = getDb();
  const defaultSince = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const since = sinceDate || defaultSince;

  const whereParts = ["context_id = ?", "published_at >= ?"];
  const params = [context, since];
  if (onlyPosts) {
    whereParts.push("(source_kind = 'post' OR source_kind IS NULL)");
  }
  whereParts.push("LENGTH(COALESCE(body, '')) >= ?");
  params.push(minBodyLen);

  const rows = db.prepare(`
    SELECT id, title, body, url, community, source_id, source_kind,
           published_at, evidence_weight, metrics, intent
    FROM evidence_packets
    WHERE ${whereParts.join(" AND ")}
  `).all(...params);

  const kwRegex = keywords ? new RegExp(keywords, "i") : null;

  const scored = rows.map(r => {
    const m = safeJson(r.metrics, {});
    const redditScore = Number(m.score || 0);
    const comments = Number(m.comments || 0);
    const weight = Number(r.evidence_weight || 1);
    const text = (r.title || "") + " " + (r.body || "");
    const keywordHit = kwRegex && kwRegex.test(text) ? 1 : 0;
    const composite = weight * Math.log10(Math.max(redditScore, 0) + 10) + 0.5 * keywordHit;
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      url: r.url,
      community: r.community,
      source_id: r.source_id,
      published_at: r.published_at,
      weight,
      score: redditScore,
      comments,
      intent: r.intent,
      _composite: composite,
    };
  });

  scored.sort((a, b) => b._composite - a._composite);
  return scored.slice(0, limit).map(({ _composite, ...rest }) => rest);
}
