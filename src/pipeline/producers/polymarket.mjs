/**
 * Polymarket producer — Gamma API, no auth.
 *
 * Expectation layer. Snapshot semantics, not search. Each ingestion produces a
 * point-in-time evidence packet per tracked market. Body is synthesized from
 * market metadata. Evidence states use the expectation_* taxonomy.
 */

const GAMMA_BASE = "https://gamma-api.polymarket.com";

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
  // Calibrate to Reddit's 0–2.6 range. Volume × liquidity proxies signal quality.
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

function communityForMarket(market) {
  const eventTitle = market.events?.[0]?.title;
  const tag = (market.events?.[0]?.ticker || market.slug || "misc").split("-")[0];
  return `polymarket:${tag}`;
}

function normalizeMarket(market, contextId, queryHint = "") {
  const prices = safeParseJson(market.outcomePrices, []);
  const probability = Number(prices[0] || 0);
  // Compute a rough 24h probability change if we can derive it from volume distribution
  // Without a historical fetch we can only set state based on market freshness; use stable as default.
  const change24h = null;
  const evidenceState = evidenceStateFromMovement({ probability, change24h });
  const today = new Date().toISOString().slice(0, 10);
  // ID must include contextId — same market across contexts produces distinct packets
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
      volume24h: Number(market.volume24hr || 0),
      volume1wk: Number(market.volume1wk || 0),
      volume_total: Number(market.volume || 0),
      liquidity: Number(market.liquidity || 0),
      end_date: market.endDate,
      condition_id: market.conditionId,
      event_title: market.events?.[0]?.title,
    }),
    topics: JSON.stringify([queryHint]),
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

/**
 * Producer interface — snapshot mode.
 * Accepts queries (used as keyword filters on market titles) OR explicit market slugs.
 */
export const polymarket = {
  id: "polymarket",
  layer: "expectation",
  kind: "snapshot",
  async search({ contextId, queries, marketSlugs = null, opts = {} }) {
    const results = [];
    if (marketSlugs?.length) {
      // Fetch each slug directly via Gamma's slug filter (more reliable than paginated listing)
      for (const slug of marketSlugs) {
        try {
          const url = new URL(`${GAMMA_BASE}/markets`);
          url.searchParams.set("slug", slug);
          const res = await fetch(url, { headers: { Accept: "application/json" } });
          if (!res.ok) continue;
          const arr = await res.json();
          const m = Array.isArray(arr) ? arr[0] : arr;
          if (m && m.slug) results.push(normalizeMarket(m, contextId));
        } catch { /* skip */ }
      }
      return results;
    }
    // Keyword match against active markets
    const all = await listMarkets({ limit: 500 });
    for (const q of queries) {
      const terms = q.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
      if (!terms.length) continue;
      for (const m of all) {
        const haystack = `${m.question || ""} ${m.description || ""} ${m.events?.[0]?.title || ""}`.toLowerCase();
        const matches = terms.filter(t => haystack.includes(t)).length;
        if (matches >= Math.max(2, Math.ceil(terms.length / 2))) {
          results.push(normalizeMarket(m, contextId, q));
        }
      }
    }
    // Dedupe by market slug
    const seen = new Set();
    return results.filter(p => {
      const slug = JSON.parse(p.raw_ref).slug;
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
  },
};
