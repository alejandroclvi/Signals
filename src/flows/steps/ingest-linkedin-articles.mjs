/**
 * Ingest LinkedIn Pulse articles (from linkedin-pulse-radar output) into the
 * evidence_packets corpus. Each article becomes a packet with:
 *   source_id: "linkedin"
 *   source_kind: "article"
 *   community: "linkedin:pulse"
 *   author_ref: derived from URL slug (best-effort)
 *   metrics JSON: { hook_score, hook_archetype, audience_breadth, query, source_query }
 *
 * Idempotent via source_item_id (pulse:<slug>).
 *
 * Args: { context, articles: [...] (any of classified/filtered output), defaultDate? }
 * Returns: { inserted, skipped, total, sample }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

function deriveSlugFromUrl(url) {
  const m = url.match(/linkedin\.com\/pulse\/([^/?#]+)/i);
  return m ? m[1] : null;
}

// Extract author from slug like "title-slug-firstname-lastname-5charid"
// Heuristic: last segment is a 5-7 char identifier; the 2 segments before it
// are likely the author's name. Imperfect for compound names but good enough.
function deriveAuthorFromSlug(slug) {
  if (!slug) return "linkedin:unknown";
  const parts = slug.split("-").filter(Boolean);
  if (parts.length < 3) return `linkedin:${slug}`;
  const tail = parts[parts.length - 1];
  // If tail looks like an opaque id (4-8 chars, mostly lowercase + digits)
  if (/^[a-z0-9]{4,8}$/.test(tail)) {
    const author = parts.slice(-3, -1).join(" ");  // 2 segments = first + last
    if (author && author.length >= 3) return `linkedin:${author}`;
  }
  // Fallback — last 2 segments
  return `linkedin:${parts.slice(-2).join(" ")}`;
}

function deriveDateFromArticle(a, defaultDate) {
  if (a.date && /^\d{4}-\d{2}-\d{2}/.test(a.date)) return a.date;
  return defaultDate || new Date().toISOString().slice(0, 10);
}

function calibrateWeight(hookScore) {
  // Hook score 0-100 → weight 0.5-2.6 (matches Reddit/HN scale)
  if (typeof hookScore !== "number") return 1.0;
  if (hookScore >= 90) return 2.6;
  if (hookScore >= 80) return 2.2;
  if (hookScore >= 70) return 1.8;
  if (hookScore >= 60) return 1.4;
  if (hookScore >= 50) return 1.0;
  return 0.7;
}

export default async function ingestLinkedInArticles({
  context,
  articles = [],
  defaultDate = null,
} = {}) {
  if (!context) throw new Error("context is required");
  if (!Array.isArray(articles)) articles = [];
  if (!articles.length) return { inserted: 0, skipped: 0, total: 0, sample: [] };

  const db = getDb();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO evidence_packets
      (id, context_id, source_id, source_layer, source_item_id, url, title, body,
       author_ref, community, observed_at, published_at, metrics, topics, raw_ref,
       content_hash, intent, awareness_level, evidence_weight, quality_score,
       sentiment, evidence_state, source_kind)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let skipped = 0;
  const sample = [];

  const tx = db.transaction(() => {
    for (const a of articles) {
      if (!a?.url || !a?.title) { skipped++; continue; }
      const slug = deriveSlugFromUrl(a.url);
      if (!slug) { skipped++; continue; }
      const sourceItemId = `pulse:${slug}`;
      const id = `linkedin:${sourceItemId}`;
      const author = deriveAuthorFromSlug(slug);
      const publishedAt = deriveDateFromArticle(a, defaultDate);
      const weight = calibrateWeight(a.hook_score);
      const metrics = JSON.stringify({
        hook_score: a.hook_score ?? null,
        hook_archetype: a.narrative_class ?? null,
        audience_breadth: a.audience_breadth ?? null,
        quotable_line: a.quotable_line ?? null,
        linkedin_template: a.linkedin_template ?? null,
        source_query: a.query ?? null,
        slug,
      });
      const r = insert.run(
        id, context, "linkedin", "conversation", sourceItemId,
        a.url, a.title.slice(0, 500), (a.snippet || a.title).slice(0, 2000),
        author, "linkedin:pulse", new Date().toISOString(), publishedAt + "T12:00:00.000Z",
        metrics, JSON.stringify([]), JSON.stringify({ from: "linkedin-pulse-radar" }),
        null, null, null, weight, null,
        null, "linkedin_hook", "article"
      );
      if (r.changes > 0) {
        inserted++;
        if (sample.length < 6) sample.push({ url: a.url, title: a.title.slice(0, 80), author, archetype: a.narrative_class, score: a.hook_score });
      } else {
        skipped++;
      }
    }
  });
  tx();

  return { inserted, skipped, total: articles.length, sample };
}
