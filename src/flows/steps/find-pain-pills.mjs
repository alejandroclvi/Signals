/**
 * Auto-mine pain pills from the corpus. A pain pill = a specific complaint with
 * a real URL, recent enough to feel current.
 *
 * Selection criteria:
 *   - body length 80-450 chars (long enough to be specific, short enough to quote)
 *   - URL present
 *   - within `windowDays` (default 60)
 *   - prefer evidence_state in {experiencing_pain, tried_failed, warning} when set
 *   - else use evidence_weight DESC as proxy
 *
 * If `signalId` provided, scope to that signal's evidence.
 * If `keywords` provided (comma-separated), additionally filter by body matching.
 *
 * Args: { context, signalId?, keywords?, windowDays?=60, max?=8 }
 * Returns: { pills: [{ quote, url, date, community, source, evidence_state, weight, signal_id }], source: "corpus" }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

const PAIN_STATES = ["experiencing_pain", "tried_failed", "warning"];

function clean(text) {
  if (!text) return "";
  return String(text)
    .replace(/<[^>]+>/g, "")
    .replace(/&#x[0-9A-F]+;/gi, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function findPainPills({
  context,
  signalId = "",
  keywords = "",
  windowDays = 60,
  max = 8,
} = {}) {
  if (!context) throw new Error("context is required");
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const windowStart = new Date(Date.now() - windowDays * 86400_000).toISOString();

  const kwList = (typeof keywords === "string" ? keywords.split(",") : keywords || [])
    .map(s => String(s).trim().toLowerCase())
    .filter(Boolean);

  const whereSignal = signalId ? `AND ep.id IN (SELECT evidence_id FROM signal_evidence WHERE signal_id = ?)` : "";
  const params = [context, windowStart];
  if (signalId) params.push(signalId);

  const rows = db.prepare(`
    SELECT ep.id, ep.url, ep.title, ep.body, ep.community, ep.author_ref,
           ep.source_id, ep.source_kind, ep.evidence_weight, ep.evidence_state,
           ep.published_at,
           se.signal_id
    FROM evidence_packets ep
    LEFT JOIN signal_evidence se ON se.evidence_id = ep.id
    WHERE ep.context_id = ?
      AND ep.body IS NOT NULL
      AND length(ep.body) >= 80
      AND ep.url IS NOT NULL
      AND ep.published_at >= ?
      ${whereSignal}
    ORDER BY
      CASE WHEN ep.evidence_state IN ('experiencing_pain','tried_failed','warning') THEN 1 ELSE 2 END,
      ep.evidence_weight DESC,
      ep.published_at DESC
    LIMIT 200
  `).all(...params);

  const seen = new Set();  // dedupe by URL
  const pills = [];
  for (const r of rows) {
    if (seen.has(r.url)) continue;
    const body = clean(r.body);
    if (body.length < 80 || body.length > 450) continue;
    if (kwList.length) {
      const hay = body.toLowerCase();
      if (!kwList.some(k => hay.includes(k))) continue;
    }
    seen.add(r.url);
    pills.push({
      quote: body.length > 360 ? body.slice(0, 360) + "…" : body,
      url: r.url,
      date: r.published_at?.slice(0, 10),
      community: r.community,
      source: r.source_id,
      evidence_state: r.evidence_state,
      weight: r.evidence_weight,
      signal_id: r.signal_id,
    });
    if (pills.length >= max) break;
  }
  return { pills, source: "corpus", windowStart: windowStart.slice(0, 10), windowEnd: today };
}
