/**
 * Select top N signals filtered by freshness tier and re-ranked by structural × freshness.
 *
 * Pipeline:
 *   1. Pull all signals scored under the lens (signal_scores table)
 *   2. Compute freshness tier for each (calls freshness-tier step)
 *   3. Filter to tier ≥ minTier
 *   4. Re-rank by total × (1 + share_30d) — so genuine momentum wins
 *   5. Return top N with full metadata (signal + freshness + score components)
 *
 * Fails loudly if no signals meet the floor — better than a stale article.
 *
 * Args: { context, lens, asOf, minTier?=4, limit?=4 }
 * Returns: array of fresh signals with same shape as extract-top + freshness fields
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";
import freshnessTier from "./freshness-tier.mjs";

function safeJson(v, f) { try { return typeof v === "string" ? JSON.parse(v) : (v ?? f); } catch { return f; } }

// Cheap valence heuristic — combines title tokens and signal tags.
// The article-draft prompt is told to verify against actual quote content,
// so a wrong heuristic gets corrected by the LLM at write-time.
const POS_TITLE = ["aha moment", "breakthrough", "wins", "success", "proof", "found what works", "best practices", "love", "adoption", "switching to", "switched to"];
const NEG_TITLE = ["skepticism", "frustration", "decline", "wall", "issues", "trust issues", "failure", "broken", "stop using", "wrong", "switching from", "switched from", "churn", "refund", "limit", "waste", "friction", "burn", "vs", "complaints"];
const POS_TAGS  = ["adoption", "found_what_works", "promoting", "narrative_positive"];
const NEG_TAGS  = ["frustration", "warning", "tried_failed", "decline"];

function computeValence(signal) {
  const title = (signal.title || "").toLowerCase();
  const tags = safeJson(signal.tags, []).map(t => String(t).toLowerCase());

  let pos = 0, neg = 0;
  for (const p of POS_TITLE) if (title.includes(p)) pos += 2;
  for (const n of NEG_TITLE) if (title.includes(n)) neg += 2;
  for (const p of POS_TAGS)  if (tags.includes(p)) pos += 1;
  for (const n of NEG_TAGS)  if (tags.includes(n)) neg += 1;

  if (pos === 0 && neg === 0) return { label: "NEUTRAL", score: 0, basis: "no signals matched" };
  const score = (pos - neg) / (pos + neg);
  if (score > 0.3)  return { label: "POSITIVE", score, basis: `pos=${pos} neg=${neg}` };
  if (score < -0.3) return { label: "NEGATIVE", score, basis: `pos=${pos} neg=${neg}` };
  return { label: "MIXED", score, basis: `pos=${pos} neg=${neg}` };
}

export default async function selectFreshSignals({ context, lens = "content", asOf = null, minTier = 4, limit = 4 } = {}) {
  if (!context) throw new Error("context is required");
  const db = getDb();

  // Pull all scored signals for this lens (include tags for valence)
  const scored = db.prepare(`
    SELECT s.id, s.title, s.mentions, s.dominant_state, s.dominant_intent, s.tags,
           ss.total, ss.rank_in_ctx, ss.components
    FROM signal_scores ss
    JOIN signals s ON s.id = ss.signal_id
    WHERE s.context_id = ? AND ss.lens = ?
  `).all(context, lens);

  if (!scored.length) {
    throw new Error(`No signal_scores rows for context=${context} lens=${lens}. Run lens-scorer first.`);
  }

  // Annotate with freshness
  const fresh = await freshnessTier({ context, asOf });
  const freshById = new Map(fresh.map(f => [f.signal_id, f]));

  const enriched = scored.map(s => {
    let topComponents = [];
    try {
      const arr = JSON.parse(s.components);
      topComponents = arr.filter(c => c.weighted > 0).sort((a, b) => b.weighted - a.weighted).slice(0, 5)
        .map(c => ({ name: c.name, weighted: c.weighted, raw: c.raw, weight: c.weight }));
    } catch { /* ignore */ }
    const f = freshById.get(s.id) || { tier: 1, tier_label: "stale", last_7d: 0, last_30d: 0, share_30d: 0, share_7d: 0, latest_at: null };
    const valence = computeValence(s);
    return {
      id: s.id,
      title: s.title,
      total: s.total,
      rank: s.rank_in_ctx,
      mentions: s.mentions,
      dominantState: s.dominant_state,
      dominantIntent: s.dominant_intent,
      tags: safeJson(s.tags, []),
      components: topComponents,
      tier: f.tier,
      tier_label: f.tier_label,
      last_7d: f.last_7d,
      last_30d: f.last_30d,
      share_7d: f.share_7d,
      share_30d: f.share_30d,
      latest_at: f.latest_at,
      valence: valence.label,
      valence_basis: valence.basis,
    };
  });

  const survivors = enriched.filter(s => s.tier >= minTier);
  if (!survivors.length) {
    const tierCounts = {};
    for (const s of enriched) tierCounts[s.tier] = (tierCounts[s.tier] || 0) + 1;
    throw new Error(
      `No signals in ${context} meet freshness tier ≥ ${minTier} (lens=${lens}). ` +
      `Tier distribution: ${JSON.stringify(tierCounts)}. ` +
      `Try --minTier 3, refresh ingestion (pnpm ingest:multi ${context} --producer hackernews), ` +
      `or pick a hotter context (see pnpm report:weekly heat map).`
    );
  }

  // Re-rank: structural × freshness boost
  survivors.sort((a, b) => {
    const aScore = a.total * (1 + a.share_30d);
    const bScore = b.total * (1 + b.share_30d);
    return bScore - aScore;
  });

  return survivors.slice(0, limit);
}
