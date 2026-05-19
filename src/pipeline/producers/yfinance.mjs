/**
 * Yahoo Finance producer — Capital-market response layer.
 *
 * Anthropic is private, so we read capital reaction via AI-exposed public
 * tickers (the beneficiaries / hosting partners / competitors). When
 * Claude has a bad week, NVDA/MSFT/GOOG move; when Anthropic raises a
 * round, AMZN moves (Anthropic's lead investor). Tracking these as a
 * basket gives a real-time capital-market read on the AI-coding-tooling
 * narrative — without paying for an equity API.
 *
 * Data source: Yahoo's undocumented chart endpoint
 *   https://query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>?interval=1d&range=7d
 *
 * No auth required. Polite delay between symbols. One evidence packet per
 * (ticker, day) — the day's close + volume + change vs prior close.
 */

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const DEFAULT_TICKERS = [
  // AI hardware
  { symbol: "NVDA", label: "Nvidia",   role: "AI hardware bellwether" },
  { symbol: "AMD",  label: "AMD",      role: "alternative AI accelerator" },
  // Anthropic-adjacent
  { symbol: "AMZN", label: "Amazon",   role: "Anthropic lead investor / Bedrock host" },
  // OpenAI / Microsoft
  { symbol: "MSFT", label: "Microsoft", role: "OpenAI investor + Azure host" },
  // Google
  { symbol: "GOOGL", label: "Alphabet", role: "Gemini owner / Vertex host" },
  // Meta
  { symbol: "META", label: "Meta",     role: "Llama owner" },
  // Pure-play AI small cap
  { symbol: "AI",   label: "C3.ai",    role: "enterprise AI pure-play" },
  // Apple
  { symbol: "AAPL", label: "Apple",    role: "consumer AI distribution" },
];
const DELAY_MS = 350;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchChart(symbol, { range = "7d", interval = "1d" } = {}) {
  const url = `${YAHOO_BASE}/${symbol}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)",
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Yahoo Finance ${res.status} for ${symbol}`);
  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo returned no chart result for ${symbol}`);
  return result;
}

function weightFromMove(absPctChange, volumeRatio) {
  // bigger move + above-average volume = higher weight
  let base = 1.0;
  if (absPctChange >= 5)      base += 0.8;
  else if (absPctChange >= 3) base += 0.5;
  else if (absPctChange >= 1) base += 0.2;
  if (volumeRatio >= 1.5)     base += 0.4;
  else if (volumeRatio >= 1.2) base += 0.2;
  return Math.min(2.6, Math.max(0.7, base));
}

function evidenceStateFromMove(pctChange) {
  if (pctChange === null || pctChange === undefined) return "capital_stable";
  if (pctChange >= 1.5)  return "capital_rising";
  if (pctChange <= -1.5) return "capital_falling";
  return "capital_stable";
}

function normalizeChart(symbol, label, role, contextId) {
  return (chart) => {
    const ts = chart.timestamp || [];
    const quote = chart.indicators?.quote?.[0] || {};
    const closes = quote.close || [];
    const volumes = quote.volume || [];
    if (!ts.length || !closes.length) return [];

    // Drop tail nulls (the latest bar may not have closed)
    let lastIdx = ts.length - 1;
    while (lastIdx >= 0 && (closes[lastIdx] == null || volumes[lastIdx] == null)) lastIdx--;
    if (lastIdx < 1) return [];

    // Average volume across the window for the ratio reference
    const validVols = volumes.slice(0, lastIdx + 1).filter(v => v != null);
    const avgVol = validVols.length ? validVols.reduce((a, b) => a + b, 0) / validVols.length : 0;

    const packets = [];
    for (let i = 1; i <= lastIdx; i++) {
      const close = closes[i];
      const prev = closes[i - 1];
      const vol = volumes[i];
      if (close == null || prev == null) continue;
      const pctChange = ((close - prev) / prev) * 100;
      const dayIso = new Date(ts[i] * 1000).toISOString();
      const day = dayIso.slice(0, 10);
      const volRatio = avgVol > 0 ? vol / avgVol : 1;
      const dir = pctChange > 0 ? "↑" : pctChange < 0 ? "↓" : "→";
      const body = `${label} (${symbol}) ${dir} ${pctChange.toFixed(2)}% close $${close.toFixed(2)} · volume ${Math.round(vol).toLocaleString("en-US")} (${volRatio.toFixed(2)}× avg)\n\nWhy this ticker for AI capital signal: ${role}`;
      packets.push({
        id: `yfinance:${symbol}:${day}`,
        context_id: contextId,
        source_id: "yfinance",
        source_kind: "equity_quote",
        source_layer: "capital",
        source_item_id: `yf_${symbol}_${day}`,
        url: `https://finance.yahoo.com/quote/${symbol}`,
        title: `${symbol} ${dir} ${pctChange.toFixed(2)}% — $${close.toFixed(2)} (${day})`,
        body,
        author_ref: "yfinance:market",
        community: `yfinance:${symbol}`,
        observed_at: new Date().toISOString(),
        published_at: dayIso,
        metrics: JSON.stringify({
          symbol,
          close,
          prevClose: prev,
          volume: vol,
          avgVolume: Math.round(avgVol),
          volumeRatio: Math.round(volRatio * 100) / 100,
          pctChange: Math.round(pctChange * 100) / 100,
          source: "yfinance",
        }),
        topics: JSON.stringify([symbol, label]),
        raw_ref: JSON.stringify({ symbol, day }),
        content_hash: null,
        intent: null,
        awareness_level: null,
        evidence_weight: weightFromMove(Math.abs(pctChange), volRatio),
        quality_score: null,
        sentiment: null,
        evidence_state: evidenceStateFromMove(pctChange),
      });
    }
    return packets;
  };
}

/**
 * Producer interface.
 *
 * Args:
 *   contextId   required
 *   tickers     optional override — array of { symbol, label, role } objects
 *               (defaults to AI-adjacent basket above)
 *   range       Yahoo range param — "5d" | "1mo" | "3mo" | "ytd" (default "7d")
 */
export const yfinance = {
  id: "yfinance",
  layer: "capital",
  kind: "snapshot",
  async search({ contextId, tickers, range = "7d" } = {}) {
    if (!contextId) throw new Error("contextId required");
    const list = (tickers && tickers.length) ? tickers : DEFAULT_TICKERS;
    const results = [];
    for (const t of list) {
      try {
        const chart = await fetchChart(t.symbol, { range });
        const packets = normalizeChart(t.symbol, t.label, t.role, contextId)(chart);
        results.push(...packets);
        await sleep(DELAY_MS);
      } catch (err) {
        console.error(`[yfinance] ${t.symbol} failed:`, err.message);
      }
    }
    return results;
  },
};
