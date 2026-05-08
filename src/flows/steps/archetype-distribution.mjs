/**
 * Compute LinkedIn Pulse archetype distribution for a context.
 * Reads evidence_packets where source_id='linkedin' and the context_id matches,
 * parses the metrics JSON for hook_archetype, returns the count + percentage
 * by archetype.
 *
 * Args: { context, windowDays?=120 }
 * Returns: {
 *   total: N,
 *   distribution: [{ archetype, count, percentage, avg_hook_score, audience_mix }],
 *   top_authors: [{ author, count, archetypes }],
 *   recommended_archetype: string  (highest count + audience-broad bias),
 * }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

function safeJson(v, f) { try { return typeof v === "string" ? JSON.parse(v) : (v ?? f); } catch { return f; } }

export default async function archetypeDistribution({ context, windowDays = 120 } = {}) {
  if (!context) throw new Error("context is required");
  const db = getDb();
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

  const rows = db.prepare(`
    SELECT id, url, title, author_ref, metrics, evidence_weight, published_at
    FROM evidence_packets
    WHERE context_id = ? AND source_id = 'linkedin'
      AND published_at >= ?
  `).all(context, since);

  if (!rows.length) {
    return { total: 0, distribution: [], top_authors: [], recommended_archetype: null };
  }

  const byArchetype = new Map();
  const byAuthor = new Map();

  for (const r of rows) {
    const m = safeJson(r.metrics, {});
    const archetype = m.hook_archetype || "unknown";
    const audience = m.audience_breadth || "unknown";
    const score = typeof m.hook_score === "number" ? m.hook_score : 0;

    if (!byArchetype.has(archetype)) {
      byArchetype.set(archetype, { count: 0, score_sum: 0, broad: 0, tech: 0 });
    }
    const a = byArchetype.get(archetype);
    a.count++;
    a.score_sum += score;
    if (audience === "broad-interest") a.broad++;
    else if (audience === "tech-only") a.tech++;

    const auth = r.author_ref || "unknown";
    if (!byAuthor.has(auth)) byAuthor.set(auth, { count: 0, archetypes: new Set() });
    const av = byAuthor.get(auth);
    av.count++;
    if (archetype !== "unknown") av.archetypes.add(archetype);
  }

  const total = rows.length;
  const distribution = [...byArchetype.entries()]
    .map(([archetype, a]) => ({
      archetype,
      count: a.count,
      percentage: Math.round(a.count / total * 100),
      avg_hook_score: a.count ? Math.round(a.score_sum / a.count) : 0,
      audience_mix: { broad: a.broad, tech: a.tech, unknown: a.count - a.broad - a.tech },
    }))
    .sort((x, y) => y.count - x.count);

  const topAuthors = [...byAuthor.entries()]
    .map(([author, v]) => ({ author, count: v.count, archetypes: [...v.archetypes] }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 8);

  // Recommended: highest count, with broad-audience tie-break
  let recommended = null;
  for (const d of distribution) {
    if (d.archetype === "unknown" || d.archetype === "other") continue;
    recommended = d.archetype;
    break;
  }

  return { total, distribution, top_authors: topAuthors, recommended_archetype: recommended };
}
