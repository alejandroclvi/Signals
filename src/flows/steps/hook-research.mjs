/**
 * Find high-engagement Reddit/HN posts in the context's evidence pool and
 * surface their titles as proven hook patterns.
 *
 * Args: { context, limit?=20 }
 * Returns: { topHooks: [{ title, url, upvotes, comments, community, source }],
 *            patterns: [{ pattern, examples: [...] }] }
 *
 * Pattern detection is cheap heuristic — not perfect, but good enough to
 * inform the article generator about WHICH hook archetypes work in this niche.
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

function safeJson(v, f) { try { return typeof v === "string" ? JSON.parse(v) : (v ?? f); } catch { return f; } }

const PATTERNS = [
  { id: "question",   regex: /^(why|how|what|when|where|is|are|do|does|did|should|can|anyone|has anyone)/i, label: "Question" },
  { id: "contrarian", regex: /\b(stop|don't|never|actually|wrong|truth|reality|myth|hate)\b/i,             label: "Contrarian" },
  { id: "story",      regex: /^(i (just|finally|tried|spent|built|switched|gave up|learned|stopped))/i,    label: "Personal story" },
  { id: "warning",    regex: /\b(warning|don't make|mistake|lesson|burned|wasted|nightmare)\b/i,           label: "Warning" },
  { id: "list",       regex: /^\d+\s+(things|ways|reasons|lessons|tips|patterns|signs|mistakes)/i,        label: "Listicle" },
  { id: "comparison", regex: /\b(vs\.?|versus|better than|comparing|switched from)\b/i,                    label: "Comparison" },
  { id: "confession", regex: /\b(unpopular|confess|admit|honest|truth is|i think)\b/i,                     label: "Confession/Opinion" },
  { id: "result",     regex: /\b(\$\d+|saved|earned|generated|grew \d+|reduced \d+|after \d+)\b/i,         label: "Specific result" },
];

function classify(title) {
  const matched = [];
  for (const p of PATTERNS) {
    if (p.regex.test(title)) matched.push(p.label);
  }
  return matched.length ? matched : ["Uncategorized"];
}

export default async function hookResearch({ context, limit = 20 } = {}) {
  if (!context) throw new Error("context is required");

  const db = getDb();

  const rows = db.prepare(`
    SELECT ep.id, ep.url, ep.title, ep.community, ep.metrics, ep.source_id, ep.source_kind, ep.published_at
    FROM evidence_packets ep
    WHERE ep.context_id = ?
      AND ep.source_kind = 'post'
      AND ep.title IS NOT NULL
      AND length(ep.title) >= 12
    ORDER BY ep.evidence_weight DESC, length(ep.title) DESC
    LIMIT ?
  `).all(context, limit * 2);  // pull double, dedupe by title

  const seen = new Set();
  const topHooks = [];
  for (const r of rows) {
    const key = r.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    const m = safeJson(r.metrics, {});
    topHooks.push({
      title: r.title,
      url: r.url,
      community: r.community,
      source: r.source_id,
      upvotes: m.score || m.points || null,
      comments: m.comments || m.num_comments || null,
      patterns: classify(r.title),
      date: r.published_at?.slice(0, 10),
    });
    if (topHooks.length >= limit) break;
  }

  // Aggregate pattern frequencies + best example each
  const byPattern = new Map();
  for (const h of topHooks) {
    for (const p of h.patterns) {
      if (!byPattern.has(p)) byPattern.set(p, { pattern: p, count: 0, examples: [] });
      const entry = byPattern.get(p);
      entry.count++;
      if (entry.examples.length < 3) entry.examples.push({ title: h.title, url: h.url, upvotes: h.upvotes });
    }
  }
  const patterns = [...byPattern.values()]
    .filter(p => p.pattern !== "Uncategorized")
    .sort((a, b) => b.count - a.count);

  return { topHooks, patterns };
}
