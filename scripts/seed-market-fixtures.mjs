/**
 * Seed market signal fixtures — Polymarket + Stock/ETF demo data.
 * Run: pnpm run seed:market
 *
 * This adds a "Market Signal Radar" context alongside existing contexts.
 * It does NOT clear other contexts — safe to run after seed-fixtures.mjs.
 */
import { getDb } from "../src/db/connection.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure migration ran first
await import(path.resolve(__dirname, "../src/db/migrate.mjs"));

const db = getDb();

// ------------------------------------------------------------------
// Context
// ------------------------------------------------------------------

const marketContext = {
  id: "market-signals",
  label: "Market Signal Radar",
  description: "Detect when prediction-market probability changes and public-market price reactions align around the same theme. Not investment advice.",
  subreddits: JSON.stringify([]),
  queries: JSON.stringify([]),
  high_intent: JSON.stringify([]),
};

// ------------------------------------------------------------------
// Source nodes
// ------------------------------------------------------------------

const marketSourceNodes = [
  { id: "polymarket", name: "Polymarket", state: "enabled", layers: ["expectation"], lift: 0, adds: "Money-backed probability movement on defined future events.", cannot: "Only covers events with active markets. Low liquidity can mislead." },
  { id: "stocks", name: "Stock / ETF Data", state: "enabled", layers: ["capital"], lift: 0, adds: "Public-market price, volume, and volatility response.", cannot: "Cannot prove causality. Delayed relative to prediction markets." },
  { id: "google-search", name: "Google Search", state: "available", layers: ["intent"], lift: 11, adds: "Active discovery and news-search intent around market events.", cannot: "Cannot prove economic commitment or conviction." },
  { id: "primary", name: "SEC / Primary Sources", state: "available", layers: ["truth"], lift: 10, adds: "Official filings, company statements, regulatory docs.", cannot: "Often validates later than market-price discovery." },
  { id: "reddit", name: "Reddit", state: "available", layers: ["conversation"], lift: 7, adds: "Retail sentiment, narrative formation, community reaction.", cannot: "Cannot prove money-backed conviction or institutional positioning." },
  { id: "hacker-news", name: "Hacker News", state: "available", layers: ["conversation"], lift: 5, adds: "Builder and technical community reaction.", cannot: "Narrow audience, often not financially oriented." },
];

// ------------------------------------------------------------------
// Signals
// ------------------------------------------------------------------

const marketSignals = [
  {
    id: "ai-regulation-repricing", rank: 1, status: "Emerging",
    title: "AI regulation repricing",
    growth: "+38pp", tags: ["economic", "narrative"],
    summary: "Polymarket probability of US AI regulation executive order rose from 23% to 61% in 14 days. AI infrastructure stocks (NVDA, MSFT, AI ETFs) showing abnormal negative returns. Confirmation: prediction and equity markets moving coherently.",
    communities: ["Polymarket", "NASDAQ"],
    mentions: 5, comments: 0, confidence: "High",
    x: 710, y: 85, r: 42, volume: 384,
    why: "Both money-backed prediction markets and public equity markets are repricing around the same regulatory narrative. The probability move is large (+38pp), well-capitalized ($142K daily volume), and confirmed by abnormal returns in directly affected stocks. This is a multi-layer signal with coherent evidence across expectation and capital layers.",
    suggested_title: "Suggested action",
    suggested_sub: "Enable SEC / Primary Sources to verify whether there are actual regulatory filings, executive orders, or official statements backing the narrative.",
    next: "Enable SEC / Primary Sources to check for actual regulatory filings or executive order drafts. Prediction markets and stock prices agree, but neither proves the event is real.",
    evidence: [
      { id: "pm-1", quote: "US AI regulation executive order — probability moved from 23% to 61% over 14 days. $142K 24h volume, $83K liquidity depth. Market is well-capitalized and actively traded.", source: "Polymarket", author: "market", age: "1d", score: 0, replies: 0 },
      { id: "pm-2", quote: "AI safety disclosure requirements — probability at 47%, up from 18%. $68K daily volume. Correlated market showing similar directional conviction.", source: "Polymarket", author: "market", age: "3d", score: 0, replies: 0 },
      { id: "pm-3", quote: "Congressional AI oversight hearing outcome — 72% probability of new committee announcement. $91K volume. Resolution date within 30 days.", source: "Polymarket", author: "market", age: "5d", score: 0, replies: 0 },
      { id: "stk-1", quote: "NVDA abnormal return -3.2% vs benchmark -0.4% over same 14-day window. Volume 2.1x 20-day average. Sector-relative underperformance consistent with regulatory risk repricing.", source: "NASDAQ", author: "market", age: "1d", score: 0, replies: 0 },
      { id: "stk-2", quote: "Global X AI & Technology ETF (AIQ) down -2.8% vs S&P 500 -0.6%. Breadth: 78% of AI ETF constituents negative. Sector rotation pattern visible.", source: "NYSE", author: "market", age: "2d", score: 0, replies: 0 },
    ],
    phrases: [["AI regulation", 12], ["executive order", 8], ["regulatory risk", 7], ["compliance requirements", 5], ["safety disclosure", 4], ["oversight hearing", 3]],
    spread: [["Polymarket", 55], ["NASDAQ", 30], ["NYSE", 15]],
    related: [["Energy sector narrative shift", "narrative", "r=0.41"], ["Tech earnings surprise cycle", "economic", "r=0.38"]],
  },
  {
    id: "crypto-etf-momentum", rank: 2, status: "Growing",
    title: "Crypto ETF approval momentum",
    growth: "+22pp", tags: ["economic", "narrative"],
    summary: "Polymarket probability of new crypto spot ETF approval rising. BTC-correlated stocks showing positive abnormal returns. However, Polymarket liquidity is thin ($12K daily volume) — thin-market warning applies.",
    communities: ["Polymarket", "NASDAQ"],
    mentions: 4, comments: 0, confidence: "Medium",
    x: 640, y: 160, r: 30, volume: 198,
    why: "Prediction market and equity prices are directionally aligned, but the Polymarket volume is low ($12K/day). Thin-market warning: the probability signal may not reflect broad conviction. Stock response is real but could be driven by other catalysts. More evidence layers needed before high confidence.",
    suggested_title: "Suggested action",
    suggested_sub: "Enable Google Search to check whether crypto ETF approval is generating active search and news interest beyond the thin prediction market.",
    next: "Enable Google Search to validate whether this thin prediction-market signal is supported by broad search interest. Also consider enabling SEC / Primary to check for actual filing activity.",
    evidence: [
      { id: "pm-4", quote: "Solana spot ETF approval by Q3 — probability at 44%, up from 22%. WARNING: $12K 24h volume, $8K liquidity. Thin market — probability may not reflect broad conviction.", source: "Polymarket", author: "market", age: "2d", score: 0, replies: 0 },
      { id: "pm-5", quote: "Additional crypto spot ETF approvals in 2026 — probability at 67%. $31K daily volume. Better-capitalized than individual coin markets.", source: "Polymarket", author: "market", age: "4d", score: 0, replies: 0 },
      { id: "stk-3", quote: "COIN (Coinbase) abnormal return +4.1% vs S&P 500 +0.3%. Volume 1.8x average. Crypto-adjacent equities rallying.", source: "NASDAQ", author: "market", age: "2d", score: 0, replies: 0 },
      { id: "stk-4", quote: "BITO (Bitcoin Strategy ETF) up +5.7% over 7 days. Volume 2.3x average. Flows turning positive after 3-week outflow streak.", source: "NYSE", author: "market", age: "3d", score: 0, replies: 0 },
    ],
    phrases: [["spot ETF", 9], ["crypto approval", 7], ["thin market", 5], ["liquidity warning", 4], ["ETF filing", 3]],
    spread: [["Polymarket", 45], ["NASDAQ", 35], ["NYSE", 20]],
    related: [["AI regulation repricing", "narrative", "r=0.28"], ["Tech earnings surprise cycle", "economic", "r=0.33"]],
  },
  {
    id: "energy-divergence", rank: 3, status: "Watch",
    title: "Energy sector narrative shift",
    growth: "+18pp", tags: ["economic", "narrative"],
    summary: "Polymarket shows rising probability of new energy policy favoring renewables. Clean energy ETFs moving positively, but traditional energy stocks flat. Divergence signal: prediction market and equity sub-sectors disagree on impact direction.",
    communities: ["Polymarket", "NYSE"],
    mentions: 4, comments: 0, confidence: "Medium",
    x: 580, y: 240, r: 26, volume: 145,
    why: "The prediction market sees policy change as likely, and clean energy equities are responding. But traditional energy stocks show no stress, suggesting the equity market sees the policy as additive to clean energy rather than destructive to incumbents. This divergence between prediction-market framing and equity-market pricing deserves more evidence before interpretation.",
    suggested_title: "Suggested action",
    suggested_sub: "Enable SEC / Primary Sources to check for actual energy policy proposals, executive actions, or regulatory filings.",
    next: "Enable SEC / Primary Sources to verify whether the policy probability is backed by actual legislative or executive action. The divergence between clean and traditional energy equity response needs primary-source confirmation.",
    evidence: [
      { id: "pm-6", quote: "New US renewable energy tax credit extension — probability at 58%, up from 40%. $54K daily volume. Well-traded market with clear resolution criteria.", source: "Polymarket", author: "market", age: "3d", score: 0, replies: 0 },
      { id: "pm-7", quote: "US rejoins Paris Agreement equivalent — probability at 39%. $27K volume. Moderate liquidity, lower conviction than the tax credit market.", source: "Polymarket", author: "market", age: "6d", score: 0, replies: 0 },
      { id: "stk-5", quote: "ICLN (iShares Global Clean Energy ETF) +3.4% vs benchmark +0.2%. Volume 1.9x average. Clean energy showing relative strength.", source: "NYSE", author: "market", age: "2d", score: 0, replies: 0 },
      { id: "stk-6", quote: "XLE (Energy Select SPDR) +0.1% vs S&P 500 +0.2%. Traditional energy flat. DIVERGENCE: prediction market sees policy change but traditional energy equity shows no stress response.", source: "NYSE", author: "market", age: "2d", score: 0, replies: 0 },
    ],
    phrases: [["energy policy", 8], ["clean energy", 7], ["renewable tax credit", 5], ["divergence signal", 4], ["traditional energy flat", 3]],
    spread: [["Polymarket", 45], ["NYSE", 55]],
    related: [["AI regulation repricing", "narrative", "r=0.41"], ["Crypto ETF approval momentum", "economic", "r=0.22"]],
  },
  {
    id: "tech-earnings-surprise", rank: 4, status: "Watch",
    title: "Tech earnings surprise cycle",
    growth: "+2.4x vol", tags: ["economic"],
    summary: "Abnormal volume in SaaS/cloud ETFs ahead of earnings season. No Polymarket signal — expectation layer is missing. Stocks-only signal with single-layer evidence.",
    communities: ["NASDAQ", "NYSE"],
    mentions: 2, comments: 0, confidence: "Low",
    x: 490, y: 330, r: 20, volume: 87,
    why: "Stock volume and price action suggest positioning ahead of tech earnings, but there is no prediction-market corroboration. This is a single-layer signal — capital market movement without money-backed expectation evidence. Confidence remains low until the expectation layer is enabled.",
    suggested_title: "Suggested action",
    suggested_sub: "Enable Polymarket to check whether earnings-related prediction markets exist and are showing directional conviction.",
    next: "Enable Polymarket to add the expectation layer. Without money-backed probability data, this stock movement could be routine pre-earnings positioning rather than a meaningful signal.",
    evidence: [
      { id: "stk-7", quote: "WCLD (WisdomTree Cloud Computing ETF) volume 2.4x 20-day average. Price flat but options activity elevated. Pre-earnings positioning pattern.", source: "NASDAQ", author: "market", age: "1d", score: 0, replies: 0 },
      { id: "stk-8", quote: "IGV (iShares Expanded Tech-Software ETF) volume 1.8x average. Sector rotation into SaaS ahead of earnings week. No directional bias yet — could be hedging.", source: "NASDAQ", author: "market", age: "2d", score: 0, replies: 0 },
    ],
    phrases: [["earnings surprise", 5], ["pre-earnings volume", 4], ["SaaS positioning", 3], ["options activity", 3]],
    spread: [["NASDAQ", 65], ["NYSE", 35]],
    related: [["AI regulation repricing", "economic", "r=0.38"], ["Crypto ETF approval momentum", "economic", "r=0.33"]],
  },
];

// ------------------------------------------------------------------
// Fixture meta
// ------------------------------------------------------------------

const marketFixtureMeta = {
  id: "market-demo",
  label: "Market signals replay",
  context_id: "market-signals",
  crumbs: "Radar / Market signals",
  period: "last 14d",
  topic_count: 8,
  selected_id: "ai-regulation-repricing",
  other_bubbles: [
    { x: 370, y: 180, r: 12, color: "#1b918d", opacity: 0.2 },
    { x: 290, y: 290, r: 9, color: "#875fb4", opacity: 0.15 },
    { x: 420, y: 350, r: 11, color: "#de5c56", opacity: 0.18 },
    { x: 340, y: 420, r: 8, color: "#2d6fbb", opacity: 0.12 },
  ],
  metrics: [
    { title: "Active markets", value: "6", delta: "+2", caption: "Polymarket events tracked", spark: [3, 3, 4, 4, 5, 6, 6] },
    { title: "Probability shocks", value: "3", delta: "+1", caption: ">15pp move in 14d", spark: [1, 1, 1, 2, 2, 3, 3] },
    { title: "Market confirmations", value: "2", delta: "+1", caption: "prediction + equity aligned", spark: [0, 0, 1, 1, 1, 2, 2] },
    { title: "Thin-market warnings", value: "1", delta: "-", caption: "<$20K daily volume", spark: [0, 1, 1, 1, 1, 1, 1] },
  ],
  timeline: {
    posts: [2, 3, 2, 3, 4, 3, 4, 5, 4, 5, 6, 7, 8, 9],
    comments: [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 7],
    authors: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5],
  },
  heatmap: [
    ["AI / Tech", [2, 4, 6, 9]],
    ["Crypto", [1, 2, 3, 4]],
    ["Energy", [0, 1, 2, 4]],
    ["SaaS / Cloud", [1, 1, 2, 3]],
  ],
  intent: [
    ["Confirmation", 34, "#3e9558"],
    ["Divergence", 24, "#de5c56"],
    ["Thin market", 18, "#bd842f"],
    ["Missing layer", 14, "#875fb4"],
    ["Conviction", 10, "#2d6fbb"],
  ],
};

// ------------------------------------------------------------------
// Insert (additive — doesn't clear other contexts)
// ------------------------------------------------------------------

const insertContext = db.prepare(
  "INSERT OR REPLACE INTO contexts (id, label, description, subreddits, queries, high_intent) VALUES (?, ?, ?, ?, ?, ?)"
);

const insertSignal = db.prepare(
  `INSERT OR REPLACE INTO signals
   (id, context_id, rank, status, title, growth, tags, summary, communities,
    mentions, comments, confidence, volume, why, suggested_title, suggested_sub,
    next_source, bubble_x, bubble_y, bubble_r)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const insertEvidence = db.prepare(
  `INSERT OR REPLACE INTO evidence_packets
   (id, context_id, source_id, source_layer, source_item_id, url, title, body,
    author_ref, community, observed_at, published_at, metrics, topics, raw_ref)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const insertSignalEvidence = db.prepare(
  "INSERT OR REPLACE INTO signal_evidence (signal_id, evidence_id) VALUES (?, ?)"
);

const insertPhrase = db.prepare(
  "INSERT INTO signal_phrases (signal_id, phrase, count) VALUES (?, ?, ?)"
);

const insertSpread = db.prepare(
  "INSERT INTO signal_spread (signal_id, community, percentage) VALUES (?, ?, ?)"
);

const insertRelated = db.prepare(
  "INSERT INTO signal_related (signal_id, label, tag, score) VALUES (?, ?, ?, ?)"
);

const insertSourceNode = db.prepare(
  "INSERT OR REPLACE INTO source_nodes (id, context_id, name, state, layers, lift, adds, cannot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);

const insertFixtureMeta = db.prepare(
  `INSERT OR REPLACE INTO fixture_meta
   (id, label, context_id, crumbs, period, topic_count, selected_id,
    other_bubbles, metrics, timeline, heatmap, intent)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

// ------------------------------------------------------------------
// Seed
// ------------------------------------------------------------------

const seed = db.transaction(() => {
  // Clear only market-signals context data (preserve other contexts)
  const oldSignals = db.prepare("SELECT id FROM signals WHERE context_id = 'market-signals'").all();
  for (const s of oldSignals) {
    db.prepare("DELETE FROM signal_related WHERE signal_id = ?").run(s.id);
    db.prepare("DELETE FROM signal_spread WHERE signal_id = ?").run(s.id);
    db.prepare("DELETE FROM signal_phrases WHERE signal_id = ?").run(s.id);
    db.prepare("DELETE FROM signal_evidence WHERE signal_id = ?").run(s.id);
  }
  db.prepare("DELETE FROM signals WHERE context_id = 'market-signals'").run();
  db.prepare("DELETE FROM evidence_packets WHERE context_id = 'market-signals'").run();
  db.prepare("DELETE FROM source_nodes WHERE context_id = 'market-signals'").run();
  db.prepare("DELETE FROM fixture_meta WHERE context_id = 'market-signals'").run();
  db.prepare("DELETE FROM contexts WHERE id = 'market-signals'").run();

  // Context
  insertContext.run(
    marketContext.id, marketContext.label, marketContext.description,
    marketContext.subreddits, marketContext.queries, marketContext.high_intent
  );

  // Source nodes
  for (const n of marketSourceNodes) {
    insertSourceNode.run(
      n.id + ":market-signals", "market-signals", n.name, n.state,
      JSON.stringify(n.layers), n.lift, n.adds, n.cannot
    );
  }

  // Signals + evidence
  for (const s of marketSignals) {
    insertSignal.run(
      s.id, "market-signals", s.rank, s.status, s.title, s.growth,
      JSON.stringify(s.tags), s.summary, JSON.stringify(s.communities),
      s.mentions, s.comments, s.confidence, s.volume, s.why,
      s.suggested_title, s.suggested_sub, s.next,
      s.x, s.y, s.r
    );

    // Inline evidence
    for (const e of s.evidence) {
      const sourceId = e.source === "Polymarket" ? "polymarket" : "stocks";
      const sourceLayer = sourceId === "polymarket" ? "expectation" : "capital";
      const eid = "inline:market-signals:" + s.id + ":" + e.id;

      insertEvidence.run(
        eid, "market-signals", sourceId, sourceLayer, e.id, "#",
        "", e.quote, e.author, e.source,
        null, null,
        JSON.stringify({ score: e.score || 0, comments: e.replies || 0 }),
        JSON.stringify([s.title]),
        "replay://market/" + s.id + "/" + e.id
      );
      insertSignalEvidence.run(s.id, eid);
    }

    // Phrases
    for (const [phrase, count] of s.phrases) {
      insertPhrase.run(s.id, phrase, count);
    }

    // Spread
    for (const [community, pct] of s.spread) {
      insertSpread.run(s.id, community, pct);
    }

    // Related
    for (const [label, tag, score] of s.related) {
      insertRelated.run(s.id, label, tag, score);
    }
  }

  // Fixture meta
  insertFixtureMeta.run(
    marketFixtureMeta.id, marketFixtureMeta.label, marketFixtureMeta.context_id,
    marketFixtureMeta.crumbs, marketFixtureMeta.period,
    marketFixtureMeta.topic_count, marketFixtureMeta.selected_id,
    JSON.stringify(marketFixtureMeta.other_bubbles), JSON.stringify(marketFixtureMeta.metrics),
    JSON.stringify(marketFixtureMeta.timeline), JSON.stringify(marketFixtureMeta.heatmap),
    JSON.stringify(marketFixtureMeta.intent)
  );

  console.log("Seeded: market-signals context with " + marketSignals.length + " signals");
});

seed();
console.log("Market fixture seed complete.");
