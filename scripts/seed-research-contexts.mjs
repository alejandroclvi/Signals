#!/usr/bin/env node

/**
 * Seed research-informed ingestion contexts.
 *
 * Each context is designed using the 3-pass research methodology:
 *   Pass 1 queries → problem language (how people describe the experience)
 *   Pass 2 queries → emotional depth / identity pain (rock bottom, "not X it's Y")
 *   Pass 3 queries → failed solutions (what they tried and abandoned)
 *
 * Queries are written from the AVATAR'S perspective — what would THEY
 * type at 11 PM when the problem feels worst? Not what a marketer would search.
 *
 * Subreddits are chosen for signal diversity:
 *   - Where practitioners hang out (not just tech enthusiasts)
 *   - Where buying decisions get discussed
 *   - Where frustration surfaces naturally
 *   - Mix of broad + niche for cross-community signal detection
 */

import "../src/db/migrate.mjs";
import { getDb } from "../src/db/connection.mjs";

const db = getDb();

const insertContext = db.prepare(
  `INSERT OR REPLACE INTO contexts (id, label, description, subreddits, queries, high_intent)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const insertNode = db.prepare(
  `INSERT OR REPLACE INTO source_nodes (id, context_id, name, state, layers, lift, adds, cannot)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const defaultNodes = [
  { id: "reddit", name: "Reddit", state: "enabled", layers: ["conversation"], lift: 0, adds: "Pain language and repeated complaints.", cannot: "Cannot prove buying intent, budget, or adoption." },
  { id: "google-search", name: "Google Search", state: "available", layers: ["intent"], lift: 11, adds: "Active discovery and comparison intent.", cannot: "Cannot prove purchase or retention." },
  { id: "hacker-news", name: "Hacker News", state: "available", layers: ["conversation"], lift: 7, adds: "Builder debate and technical skepticism.", cannot: "Narrow audience, not broad demand." },
  { id: "github", name: "GitHub", state: "available", layers: ["behavior"], lift: 9, adds: "Implementation artifacts and developer adoption.", cannot: "Cannot prove buyer budget." },
  { id: "primary", name: "Primary Sources", state: "available", layers: ["truth"], lift: 10, adds: "Official confirmation, filings, docs, vendor claims.", cannot: "Often validates later than social discovery." },
];

function seedContext(ctx) {
  insertContext.run(
    ctx.id, ctx.label, ctx.description,
    JSON.stringify(ctx.subreddits),
    JSON.stringify(ctx.queries),
    JSON.stringify(ctx.high_intent || [])
  );
  for (const n of defaultNodes) {
    insertNode.run(
      n.id + ":" + ctx.id, ctx.id, n.name, n.state,
      JSON.stringify(n.layers), n.lift, n.adds, n.cannot
    );
  }
  console.log("Seeded: " + ctx.id + " (" + ctx.subreddits.length + " subs, " + ctx.queries.length + " queries)");
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT 1: Market Intelligence Demand
//
// WHO: Founders, product managers, growth leads who need to understand
//      what's changing in their market before competitors do.
//
// WHY: This is Signals' own market. We need to understand awareness
//      levels: are people problem-aware (know they're flying blind)
//      or product-aware (tried Brandwatch/Mention/SparkToro and frustrated)?
// ═══════════════════════════════════════════════════════════════

seedContext({
  id: "market-intelligence-demand",
  label: "Market Intelligence Demand",
  description: "People trying to understand their market, track competitors, or detect trends before they become obvious. Our direct market.",
  subreddits: [
    "startups",
    "Entrepreneur",
    "SaaS",
    "ProductManagement",
    "GrowthHacking",
    "marketing",
    "digital_marketing",
    "bigseo",
  ],
  queries: [
    // Pass 1 — Problem language: how do they describe the experience?
    // (These are what someone types when they feel the problem, not when they're shopping)
    "how do you keep track of what competitors are doing",
    "how do you know what customers actually want",
    "missed a trend and lost market share",
    "flying blind on market changes",
    "how do you monitor your industry",

    // Pass 2 — Emotional depth: rock bottom, identity-level pain
    "our competitor launched exactly what we were building",
    "blindsided by market shift",
    "wasting time on the wrong features",
    "customers leaving and we don't know why",
    "board asking about market trends and I have nothing",

    // Pass 3 — Failed solutions: what they tried and abandoned
    "social listening tool not worth it",
    "Brandwatch too expensive for startup",
    "Google Alerts useless for market intelligence",
    "tried Mention but data quality is terrible",
    "alternative to SparkToro",
    "switched from Brandwatch",
    "social listening waste of money",
  ],
  high_intent: [
    "looking for alternative",
    "switched from",
    "anyone using",
    "too expensive",
    "doesn't actually work",
    "waste of money",
    "better than",
    "how do you track",
    "need a tool",
    "built my own",
  ],
});

// ═══════════════════════════════════════════════════════════════
// CONTEXT 2: Reddit as a Research Channel
//
// WHO: People who specifically use Reddit for market research,
//      customer discovery, or competitive intelligence.
//
// WHY: These are our most aware prospects — they already know
//      Reddit has signal value but struggle to extract it
//      systematically. High product-awareness expected.
// ═══════════════════════════════════════════════════════════════

seedContext({
  id: "reddit-research-demand",
  label: "Reddit as Research Source",
  description: "People trying to use Reddit for market research, customer discovery, or competitive intelligence. Highest awareness segment.",
  subreddits: [
    "startups",
    "Entrepreneur",
    "SaaS",
    "marketing",
    "digital_marketing",
    "datascience",
    "analytics",
    "ProductManagement",
  ],
  queries: [
    // Pass 1 — Problem language
    "using Reddit for market research",
    "monitoring Reddit for brand mentions",
    "how to track Reddit conversations about my product",
    "Reddit scraping for business intelligence",
    "analyzing Reddit data for customer insights",

    // Pass 2 — Emotional depth
    "manually reading Reddit threads takes forever",
    "Reddit has the best customer feedback but no way to track it",
    "missed important Reddit thread about our product",
    "competitors are using Reddit data and we're not",

    // Pass 3 — Failed solutions
    "Reddit search is terrible for finding patterns",
    "tried Gummysearch for Reddit monitoring",
    "Syften Reddit monitoring review",
    "Reddit API changes broke my monitoring",
    "alternative to Gummysearch",
    "Reddit monitoring tool recommendation",
  ],
  high_intent: [
    "monitoring Reddit",
    "track Reddit",
    "Reddit API",
    "Reddit scraping",
    "Reddit research",
    "Reddit data",
    "anyone using",
    "alternative to",
    "built a tool",
  ],
});

// ═══════════════════════════════════════════════════════════════
// CONTEXT 3: AI Agent Infrastructure Demand
//
// WHO: Developers and founders building AI-powered products
//      that need to interact with real-world data sources.
//
// WHY: Signals is an agentic system at its core. Understanding
//      the AI agent builder community reveals both potential
//      users and potential architecture patterns.
// ═══════════════════════════════════════════════════════════════

seedContext({
  id: "ai-agent-tooling",
  label: "AI Agent Tooling Demand",
  description: "Developers building AI agents that need real-world data access, web browsing, API orchestration. Adjacent market for Signals-as-infrastructure.",
  subreddits: [
    "artificial",
    "MachineLearning",
    "LangChain",
    "LocalLLaMA",
    "ChatGPT",
    "ClaudeAI",
    "SaaS",
    "webdev",
  ],
  queries: [
    // Pass 1 — Problem language
    "building AI agent that needs live data",
    "AI agent web browsing is unreliable",
    "how to give AI agents access to real-time information",
    "AI agent tool use limitations",
    "connecting AI to external data sources",

    // Pass 2 — Emotional depth
    "AI agent keeps hallucinating about current events",
    "spent weeks building data pipeline for AI agent",
    "AI agent project stuck on data quality",
    "RAG is not enough for real-time intelligence",

    // Pass 3 — Failed solutions
    "LangChain web scraping too fragile",
    "tried Tavily for AI agent search",
    "Firecrawl vs Browserbase for AI agents",
    "AI agent framework too complex for simple tasks",
    "switched from LangChain to",
    "alternative to CrewAI",
  ],
  high_intent: [
    "building an agent",
    "agent framework",
    "switched from",
    "alternative to",
    "too complex",
    "data pipeline",
    "real-time data",
    "looking for",
    "anyone using",
    "built a tool",
  ],
});

console.log("\nAll research contexts seeded.");
