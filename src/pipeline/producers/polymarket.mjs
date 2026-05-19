/**
 * Polymarket producer — Expectation layer.
 *
 * Discovery strategy:
 *   The Gamma `/markets` endpoint's default-sort and `search` parameter are
 *   useless for narrow contexts — they return the top-volume political /
 *   sports markets regardless of input. The only filter that actually works
 *   is `tag_id`. So we drive discovery off a curated AI-/tech-tag set
 *   (configurable per call), fetch markets under each tag, dedupe by id,
 *   and normalize.
 *
 *   For hand-curated runs, pass `marketSlugs` instead of `tagIds` to pull
 *   specific markets directly.
 *
 * Tag IDs discovered via /events response inspection (the markets endpoint
 * itself doesn't return tags — events do). These are the load-bearing IDs:
 *
 *     439     AI            — broad AI category
 *     553     anthropic     — Anthropic-specific
 *     537     OpenAI        — OpenAI-specific
 *     103303  Claude        — Claude model markets
 *     103648  Claude 5      — Claude 5 release markets
 *     1401    Tech          — generic tech
 *     101999  Big Tech      — sector-level
 *     969     downtime      — outage markets (e.g. "Will Claude go down N days?")
 *     1563    outage        — same theme, different tag
 *
 * Each ingestion produces one point-in-time evidence packet per market.
 * Body is synthesized from market metadata. Evidence state uses the
 * expectation_* taxonomy.
 */

const GAMMA_BASE = "https://gamma-api.polymarket.com";

const DEFAULT_AI_TECH_TAGS = [
  439,     // AI
  553,     // anthropic
  537,     // OpenAI
  103303,  // Claude
  103648,  // Claude 5
  1401,    // Tech
  101999,  // Big Tech
];

const RELIABILITY_TAGS = [
  969,     // downtime
  1563,    // outage
];

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function evidenceStateFromMovement({ probability, change24h }) {
  if (change24h === undefined || change24h === null) return "expectation_stable";
  if (change24h > 0.05)  return "expectation_rising";
  if (change24h < -0.05) return "expectation_falling";
  return "expectation_stable";
}

function pickWeightFromVolume(volume24h = 0, liquidity = 0) {
  const v = Number(volume24h) || 0;
  const l = Number(liquidity)  || 0;
  if (v >= 50000 && l >= 50000) return 2.6;
  if (v >= 10000 && l >= 10000) return 2.0;
  if (v >= 1000  && l >= 1000)  return 1.5;
  if (v >= 100   || l >= 100)   return 1.0;
  return 0.7;
}

function synthesizeBody(market, probability, change24h) {
  const pct = (probability * 100).toFixed(1);
  const dir = change24h > 0.01 ? "↑" : change24h < -0.01 ? "↓" : "→";
  const delta = change24h !== undefined && change24h !== null ? `${dir} ${(change24h * 100).toFixed(1)}pp 24h` : "";
  const volume = Number(market.volume24hr || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const liquidity = Number(market.liquidity || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `Polymarket: "${market.question}"\nYES = ${pct}% ${delta}\nVolume 24h: $${volume}  Liquidity: $${liquidity}\nResolves: ${market.endDate || "N/A"}\n\n${market.description?.slice(0, 400) || ""}`;
}

/**
 * Fetch tag definitions. Useful for discovery / debugging. Note the Gamma
 * `/tags` endpoint returns ~100 tags per page; pagination is best-effort.
 */
export async function listTags({ limit = 200 } = {}) {
  const url = new URL(`${GAMMA_BASE}/tags`);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Polymarket /tags ${res.status}`);
  return res.json();
}

/**
 * Generic market listing — kept for backwards compatibility but no longer
 * the primary discovery path. Use `listMarketsByTag` instead.
 */
export async function listMarkets({ search = null, limit = 100, active = true } = {}) {
  const url = new URL(`${GAMMA_BASE}/markets`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("active", String(active));
  url.searchParams.set("closed", "false");
  if (search) url.searchParams.set("search", search);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Polymarket Gamma ${res.status}`);
  return res.json();
}

/**
 * The discovery primitive that actually filters. Returns markets carrying
 * the given tag, active and not closed by default.
 */
export async function listMarketsByTag(tagId, { limit = 100, active = true } = {}) {
  const url = new URL(`${GAMMA_BASE}/markets`);
  url.searchParams.set("tag_id", String(tagId));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("active", String(active));
  url.searchParams.set("closed", "false");
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Polymarket /markets?tag_id=${tagId} ${res.status}`);
  return res.json();
}

function communityForMarket(market) {
  const tag = (market.events?.[0]?.ticker || market.slug || "misc").split("-")[0];
  return `polymarket:${tag}`;
}

function normalizeMarket(market, contextId, queryHint = "") {
  const prices = safeParseJson(market.outcomePrices, []);
  const probability = Number(prices[0] || 0);
  const change24h = market.oneDayPriceChange ?? null;
  const evidenceState = evidenceStateFromMovement({ probability, change24h });
  const today = new Date().toISOString().slice(0, 10);
  const id = `polymarket:${contextId}:${market.slug}:${today}`;
  return {
    id,
    context_id: contextId,
    source_id: "polymarket",
    source_kind: "market_prediction",
    source_layer: "expectation",
    source_item_id: `pm-${market.slug}-${today}`,
    url: `https://polymarket.com/market/${market.slug}`,
    title: market.question || "",
    body: synthesizeBody(market, probability, change24h),
    author_ref: "polymarket:aggregate",
    community: communityForMarket(market),
    observed_at: new Date().toISOString(),
    published_at: market.updatedAt || market.startDate || new Date().toISOString(),
    metrics: JSON.stringify({
      probability,
      change24h,
      volume24h: Number(market.volume24hr || 0),
      volume1wk: Number(market.volume1wk || 0),
      volume_total: Number(market.volume || 0),
      liquidity: Number(market.liquidity || 0),
      end_date: market.endDate,
      condition_id: market.conditionId,
      event_title: market.events?.[0]?.title,
    }),
    topics: JSON.stringify([queryHint].filter(Boolean)),
    raw_ref: JSON.stringify({ slug: market.slug, conditionId: market.conditionId }),
    content_hash: null,
    intent: null,
    awareness_level: null,
    evidence_weight: pickWeightFromVolume(market.volume24hr, market.liquidity),
    quality_score: null,
    sentiment: null,
    evidence_state: evidenceState,
  };
}

function parseTagIds(input) {
  if (!input) return null;
  if (Array.isArray(input)) return input.map(Number).filter(Boolean);
  return String(input).split(",").map(s => Number(s.trim())).filter(Boolean);
}

/**
 * Producer interface — snapshot mode.
 *
 * Args:
 *   contextId    required
 *   queries      optional — kept for backwards compat; only used to tag the
 *                normalized packet's `topics`. NOT used for filtering anymore.
 *   marketSlugs  optional — explicit market slugs to fetch (skips tag discovery)
 *   tagIds       optional — tag IDs to discover under (default: AI/tech curated set)
 *   includeReliabilityTags  default true — adds 969,1563 (downtime/outage tags)
 *                           when running an AI context, so you get Claude-/OpenAI-
 *                           outage betting markets in the same call
 *   perTagLimit  default 50 — max markets per tag
 */
export const polymarket = {
  id: "polymarket",
  layer: "expectation",
  kind: "snapshot",
  async search({
    contextId,
    queries = [],
    marketSlugs = null,
    tagIds = null,
    includeReliabilityTags = true,
    perTagLimit = 50,
  } = {}) {
    if (!contextId) throw new Error("contextId required");
    const results = [];

    // --- Slug path (hand-curated) ---
    if (marketSlugs?.length) {
      for (const slug of marketSlugs) {
        try {
          const url = new URL(`${GAMMA_BASE}/markets`);
          url.searchParams.set("slug", slug);
          const res = await fetch(url, { headers: { Accept: "application/json" } });
          if (!res.ok) continue;
          const arr = await res.json();
          const m = Array.isArray(arr) ? arr[0] : arr;
          if (m && m.slug) results.push(normalizeMarket(m, contextId, slug));
        } catch { /* skip */ }
      }
      return results;
    }

    // --- Tag-based discovery (default) ---
    let tags = parseTagIds(tagIds) || DEFAULT_AI_TECH_TAGS;
    if (includeReliabilityTags) {
      tags = Array.from(new Set([...tags, ...RELIABILITY_TAGS]));
    }

    const byId = new Map();
    for (const tag of tags) {
      try {
        const markets = await listMarketsByTag(tag, { limit: perTagLimit });
        for (const m of markets) {
          if (!m?.slug) continue;
          if (byId.has(m.id)) continue;
          byId.set(m.id, m);
        }
      } catch (err) {
        console.error(`[polymarket] tag_id=${tag} failed:`, err.message);
      }
    }

    // Optional refinement: if queries are provided AND any match the
    // market text, push those first (boost ranking) — but don't drop the
    // non-matchers. The Expectation layer benefits from breadth.
    const allMarkets = [...byId.values()];
    if (queries.length) {
      const qLower = queries.map(q => q.toLowerCase());
      allMarkets.sort((a, b) => {
        const ah = qLower.some(q => (a.question + " " + (a.description || "")).toLowerCase().includes(q));
        const bh = qLower.some(q => (b.question + " " + (b.description || "")).toLowerCase().includes(q));
        return (bh ? 1 : 0) - (ah ? 1 : 0);
      });
    }

    for (const m of allMarkets) {
      const queryHit = queries.find(q => (m.question + " " + (m.description || "")).toLowerCase().includes(q.toLowerCase()));
      results.push(normalizeMarket(m, contextId, queryHit || ""));
    }
    return results;
  },
};
