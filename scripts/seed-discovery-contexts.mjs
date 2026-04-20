#!/usr/bin/env node

/**
 * Discovery-mode ingestion contexts.
 *
 * KEY DIFFERENCE from previous approach:
 *   - NO subreddits. Reddit's global search discovers the communities.
 *   - Queries are pain phrases written from the AVATAR's perspective.
 *   - Organized by 3-pass research method (problem language → emotional depth → failed solutions).
 *
 * The ad framework teaches: "Become the avatar. What would THEY type at 11 PM
 * when the problem feels worst? Not what a marketer would search — what they
 * would search. The queries come from empathy, not strategy."
 *
 * Each query is a moment of pain, not a keyword.
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
    JSON.stringify(ctx.subreddits || []),  // empty = discovery mode
    JSON.stringify(ctx.queries),
    JSON.stringify(ctx.high_intent || [])
  );
  for (const n of defaultNodes) {
    insertNode.run(
      n.id + ":" + ctx.id, ctx.id, n.name, n.state,
      JSON.stringify(n.layers), n.lift, n.adds, n.cannot
    );
  }
  console.log("Seeded: " + ctx.id + " (" + ctx.queries.length + " pain queries, " + (ctx.subreddits?.length || 0) + " subreddits → " + (ctx.subreddits?.length ? "targeted" : "DISCOVERY") + ")");
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT 1: "I can't see what's changing in my market"
//
// AVATAR: Founder, head of product, or growth lead at a startup
//         or mid-market company. They know they should understand
//         their market better but they're flying blind. Some have
//         tried tools. Most just scroll Twitter and Reddit manually.
//
// NO SUBREDDITS — let Reddit discover where this pain lives.
// ═══════════════════════════════════════════════════════════════

seedContext({
  id: "market-blindness",
  label: "Market Blindness",
  description: "People who feel they can't see what's changing in their market until it's too late. Discovery mode — no community assumptions.",
  subreddits: [],  // DISCOVERY MODE
  queries: [
    // ── Pass 1: Problem language ──
    // How do they describe the MOMENT they feel the problem?
    // Not "competitive intelligence" — the actual experience.
    "competitor launched exactly what we were building",
    "found out about a market change from a customer",
    "we built the wrong thing because we weren't listening to the market",
    "manually checking competitor websites every week",
    "spending hours scrolling Reddit and Twitter for market intel",

    // ── Pass 2: Emotional depth / rock bottom ──
    // What do they type when it's 11 PM and the problem feels worst?
    "blindsided by competitor announcement",
    "feel like I'm always the last to know about industry changes",
    "our strategy is basically guessing",
    "board asked about market trends and I had nothing",
    "tired of being surprised by what competitors ship",

    // ── Pass 3: Failed solutions ──
    // What they tried and why it didn't work.
    // Name the products. Name the complaints.
    "Google Alerts completely useless for competitive intelligence",
    "paying for social listening tool and getting nothing useful",
    "tried Brandwatch way too expensive for what you get",
    "Mention gives mentions but no actual insights",
    "social listening is just sentiment scores and word clouds",
  ],
  high_intent: [
    "alternative to",
    "switched from",
    "waste of money",
    "too expensive",
    "doesn't actually",
    "looking for",
    "built my own",
    "anyone found",
    "how do you track",
  ],
});

// ═══════════════════════════════════════════════════════════════
// CONTEXT 2: "Reddit has signal but I can't extract it"
//
// AVATAR: Someone who already knows Reddit has valuable signal
//         for their business/research. They manually browse,
//         maybe tried a tool or two. They're product-aware —
//         they KNOW tools exist but they all suck.
//
// This is the highest-intent audience for Signals.
// ═══════════════════════════════════════════════════════════════

seedContext({
  id: "reddit-signal-extraction",
  label: "Reddit Signal Extraction",
  description: "People who know Reddit has business intelligence value but can't extract it systematically. Product-aware, high intent.",
  subreddits: [],  // DISCOVERY MODE
  queries: [
    // ── Pass 1: Problem language ──
    "spending hours reading Reddit threads for market research",
    "manually monitoring subreddits for product mentions",
    "Reddit has amazing customer feedback but no way to search it properly",
    "trying to track what people say about us on Reddit",
    "scraping Reddit for customer research",

    // ── Pass 2: Emotional depth ──
    "Reddit search is so bad I miss important threads",
    "customer mentioned our product on Reddit and I found out weeks later",
    "competitors are using Reddit data and we're just guessing",
    "reading Reddit for work feels like drowning in noise",

    // ── Pass 3: Failed solutions ──
    "GummySearch shut down alternative",
    "tried Syften for Reddit monitoring not worth it",
    "Reddit API pricing killed my monitoring setup",
    "F5Bot Reddit alerts too basic",
    "built a Reddit scraper but it keeps breaking",
  ],
  high_intent: [
    "GummySearch",
    "Syften",
    "Reddit monitoring",
    "Reddit API",
    "alternative to",
    "shut down",
    "keeps breaking",
    "not worth it",
    "built my own",
  ],
});

// ═══════════════════════════════════════════════════════════════
// CONTEXT 3: "I need to understand demand before I build"
//
// AVATAR: Indie hacker, solopreneur, or early-stage founder
//         trying to validate ideas or find markets. They lurk
//         Reddit looking for pain to solve. They want to see
//         what people complain about most.
//
// This person IS the manual version of what Signals automates.
// ═══════════════════════════════════════════════════════════════

seedContext({
  id: "demand-discovery",
  label: "Demand Discovery",
  description: "People trying to find unmet demand or validate product ideas by reading what people complain about online.",
  subreddits: [],  // DISCOVERY MODE
  queries: [
    // ── Pass 1: Problem language ──
    "how do you find problems worth solving",
    "reading Reddit to find startup ideas",
    "what are people complaining about that nobody is solving",
    "how to validate if there's real demand for my idea",
    "finding pain points to build a product around",

    // ── Pass 2: Emotional depth ──
    "built something nobody wanted and I could have known",
    "wasted months building a solution without validating demand",
    "everyone says validate first but how do you actually do it",
    "I keep finding ideas that already have ten competitors",

    // ── Pass 3: Failed solutions ──
    "SparkToro shows audience data but not actual pain",
    "Google Trends too generic for finding specific demand",
    "tried reading Reddit forums for hours waste of time",
    "product validation tools are all surveys nobody fills out",
    "Exploding Topics shows trends but not whether people will pay",
  ],
  high_intent: [
    "validate",
    "demand",
    "pain point",
    "problem worth solving",
    "would you pay for",
    "built something nobody",
    "finding ideas",
    "alternative to",
  ],
});

console.log("\nAll discovery contexts seeded. Subreddits are empty — Reddit will discover the communities.");
