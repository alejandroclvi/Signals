/**
 * Stocktwits producer — Capital-market response layer (sentiment dimension).
 *
 * Pairs with yfinance: prices tell us *what* the market did; Stocktwits
 * tells us *what retail traders are saying* alongside the move. Free
 * public API, no auth required:
 *
 *   https://api.stocktwits.com/api/2/streams/symbol/<SYMBOL>.json?limit=N
 *
 * Each message can carry a sentiment tag (`bullish` / `bearish`) the user
 * picked when posting. We preserve that as the message's evidence_state
 * (sentiment_bullish / sentiment_bearish / sentiment_neutral).
 *
 * Note: Stocktwits has a soft 200-message-per-symbol-per-hour cap. We
 * fetch up to 30 per ticker per run, which keeps us well inside that.
 */

const ST_BASE = "https://api.stocktwits.com/api/2/streams/symbol";
const DELAY_MS = 400;
const DEFAULT_LIMIT = 30;

const DEFAULT_TICKERS = ["NVDA", "AMD", "AMZN", "MSFT", "GOOGL", "META", "AI", "AAPL"];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchStream(symbol, limit = DEFAULT_LIMIT) {
  const url = `${ST_BASE}/${encodeURIComponent(symbol)}.json?limit=${Math.min(limit, 30)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (SignalsLocalPoC)", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Stocktwits ${res.status} for ${symbol}`);
  const json = await res.json();
  return json.messages || [];
}

function evidenceStateFromSentiment(sentiment) {
  if (!sentiment) return "sentiment_neutral";
  if (sentiment === "Bullish") return "sentiment_bullish";
  if (sentiment === "Bearish") return "sentiment_bearish";
  return "sentiment_neutral";
}

function weightFromMessage(message) {
  const likes = message.likes?.total || 0;
  const reshares = message.reshares?.reshared_count || 0;
  const followers = message.user?.followers || 0;
  let base = 0.7;
  if (likes >= 50)        base += 0.6;
  else if (likes >= 15)   base += 0.4;
  else if (likes >= 3)    base += 0.2;
  if (reshares >= 3)      base += 0.2;
  if (followers >= 10000) base += 0.4;
  else if (followers >= 1000) base += 0.2;
  // Penalize obvious spam (very high message count + zero followers)
  const msgCount = message.user?.ideas || 0;
  if (msgCount > 5000 && followers < 50) base -= 0.3;
  return Math.min(2.6, Math.max(0.5, base));
}

function normalizeMessage(symbol, message, contextId) {
  const sentiment = message.entities?.sentiment?.basic;
  const created = message.created_at || new Date().toISOString();
  const body = (message.body || "").slice(0, 1400);
  const user = message.user?.username || "anonymous";
  const followers = message.user?.followers || 0;
  return {
    id: `stocktwits:${message.id}`,
    context_id: contextId,
    source_id: "stocktwits",
    source_kind: "trader_message",
    source_layer: "capital",
    source_item_id: `st_${message.id}`,
    url: `https://stocktwits.com/${user}/message/${message.id}`,
    title: `$${symbol} · ${user}${followers ? ` (${followers} followers)` : ""}${sentiment ? ` · ${sentiment}` : ""}`,
    body,
    author_ref: `stocktwits:${user}`,
    community: `stocktwits:$${symbol}`,
    observed_at: new Date().toISOString(),
    published_at: created,
    metrics: JSON.stringify({
      symbol,
      sentiment,
      likes: message.likes?.total || 0,
      reshares: message.reshares?.reshared_count || 0,
      user_followers: followers,
      user_ideas: message.user?.ideas || 0,
      source: "stocktwits",
    }),
    topics: JSON.stringify([symbol]),
    raw_ref: JSON.stringify({ id: message.id, symbol }),
    content_hash: null,
    intent: null,
    awareness_level: null,
    evidence_weight: weightFromMessage(message),
    quality_score: null,
    sentiment,
    evidence_state: evidenceStateFromSentiment(sentiment),
  };
}

/**
 * Producer interface.
 *
 * Args:
 *   contextId       required
 *   tickers         optional array of symbol strings (default AI basket)
 *   limit           messages per ticker (default 30, max 30)
 *   keywordFilter   optional regex string — only keep messages whose body
 *                   matches this (e.g., "anthropic|claude|openai|ai"). When
 *                   omitted, returns all recent ticker messages.
 */
export const stocktwits = {
  id: "stocktwits",
  layer: "capital",
  kind: "search",
  async search({ contextId, tickers, limit = DEFAULT_LIMIT, keywordFilter } = {}) {
    if (!contextId) throw new Error("contextId required");
    const tlist = tickers && tickers.length ? tickers : DEFAULT_TICKERS;
    const kwRegex = keywordFilter ? new RegExp(keywordFilter, "i") : null;
    const results = [];

    for (const symbol of tlist) {
      try {
        const messages = await fetchStream(symbol, limit);
        for (const m of messages) {
          const text = m.body || "";
          if (kwRegex && !kwRegex.test(text)) continue;
          results.push(normalizeMessage(symbol, m, contextId));
        }
        await sleep(DELAY_MS);
      } catch (err) {
        console.error(`[stocktwits] ${symbol} failed:`, err.message);
      }
    }
    return results;
  },
};
