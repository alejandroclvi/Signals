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
  `INSERT OR REPLACE INTO contexts (id, label, description, subreddits, queries, high_intent, thesis, avatar, research_passes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    JSON.stringify(ctx.subreddits || []),
    JSON.stringify(ctx.queries),
    JSON.stringify(ctx.high_intent || []),
    ctx.thesis || null,
    ctx.avatar || null,
    JSON.stringify(ctx.research_passes || null)
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
  thesis: "Founders and product leaders are flying blind on market changes. They find out about competitor moves from customers, miss trends until it's too late, and waste time manually checking websites. Some have tried social listening tools (Brandwatch, Mention, SparkToro) and found them expensive, noisy, or useless. We're looking for where this pain surfaces organically — and whether the frustrated installed base (mass technological desire) is larger than the unaware market (mass instinct).",
  avatar: "Startup founder or head of product, 28-45. Runs a team of 3-30. Knows they should understand their market better but the tools either don't exist, cost too much, or produce dashboards full of sentiment scores nobody reads. They manually scroll Reddit and Twitter, check competitor websites weekly, and still get blindsided. They've either never tried a tool (problem-aware) or tried one and found it useless (product-aware).",
  research_passes: {
    pass1: {
      label: "Problem language",
      description: "How they describe the MOMENT they feel the problem. Not categories — experiences.",
      queries: [
        "competitor launched exactly what we were building",
        "found out about a market change from a customer",
        "we built the wrong thing because we weren't listening to the market",
        "manually checking competitor websites every week",
        "spending hours scrolling Reddit and Twitter for market intel",
      ],
    },
    pass2: {
      label: "Emotional depth",
      description: "What they type at 11 PM when the problem feels worst. Rock bottom, identity-level pain.",
      queries: [
        "blindsided by competitor announcement",
        "feel like I'm always the last to know about industry changes",
        "our strategy is basically guessing",
        "board asked about market trends and I had nothing",
        "tired of being surprised by what competitors ship",
      ],
    },
    pass3: {
      label: "Failed solutions",
      description: "What they tried and why it didn't work. Named products, specific complaints.",
      queries: [
        "Google Alerts completely useless for competitive intelligence",
        "paying for social listening tool and getting nothing useful",
        "tried Brandwatch way too expensive for what you get",
        "Mention gives mentions but no actual insights",
        "social listening is just sentiment scores and word clouds",
      ],
    },
  },
  subreddits: [],
  queries: [
    "competitor launched exactly what we were building",
    "found out about a market change from a customer",
    "we built the wrong thing because we weren't listening to the market",
    "manually checking competitor websites every week",
    "spending hours scrolling Reddit and Twitter for market intel",
    "blindsided by competitor announcement",
    "feel like I'm always the last to know about industry changes",
    "our strategy is basically guessing",
    "board asked about market trends and I had nothing",
    "tired of being surprised by what competitors ship",
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
  thesis: "A specific segment already knows Reddit contains valuable signal for their business — customer pain, competitor mentions, product feedback, market shifts. They manually browse or tried tools that shut down (GummySearch), are too basic (F5Bot), or broke when Reddit changed API pricing. This is our highest-intent audience: they already do manually what Signals automates. We expect mostly product-aware evidence with mass technological desire.",
  avatar: "Product manager, growth marketer, or founder who already reads Reddit for work. 25-40. Spends 30-60 min/day scanning subreddits. Has tried at least one monitoring tool. Frustrated that Reddit search is terrible, tools keep shutting down, and the API pricing change broke their workflow. They know the signal is there — they just can't extract it at scale.",
  research_passes: {
    pass1: {
      label: "Problem language",
      description: "How they describe the daily experience of manually monitoring Reddit.",
      queries: [
        "spending hours reading Reddit threads for market research",
        "manually monitoring subreddits for product mentions",
        "Reddit has amazing customer feedback but no way to search it properly",
        "trying to track what people say about us on Reddit",
        "scraping Reddit for customer research",
      ],
    },
    pass2: {
      label: "Emotional depth",
      description: "The frustration of missing signal, being behind competitors.",
      queries: [
        "Reddit search is so bad I miss important threads",
        "customer mentioned our product on Reddit and I found out weeks later",
        "competitors are using Reddit data and we're just guessing",
        "reading Reddit for work feels like drowning in noise",
      ],
    },
    pass3: {
      label: "Failed solutions",
      description: "Tools they tried: GummySearch (shut down), Syften, F5Bot, custom scrapers.",
      queries: [
        "GummySearch shut down alternative",
        "tried Syften for Reddit monitoring not worth it",
        "Reddit API pricing killed my monitoring setup",
        "F5Bot Reddit alerts too basic",
        "built a Reddit scraper but it keeps breaking",
      ],
    },
  },
  subreddits: [],
  queries: [
    "spending hours reading Reddit threads for market research",
    "manually monitoring subreddits for product mentions",
    "Reddit has amazing customer feedback but no way to search it properly",
    "trying to track what people say about us on Reddit",
    "scraping Reddit for customer research",
    "Reddit search is so bad I miss important threads",
    "customer mentioned our product on Reddit and I found out weeks later",
    "competitors are using Reddit data and we're just guessing",
    "reading Reddit for work feels like drowning in noise",
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
  thesis: "Indie hackers and early-stage founders lurk Reddit looking for pain to solve. They want to find problems worth building for, validate demand before writing code, and avoid building something nobody wants. Current tools (SparkToro, Google Trends, Exploding Topics) show trends but not pain — they can't tell you whether people will pay. This person IS the manual version of what Signals automates.",
  avatar: "Indie hacker or first-time founder, 22-38. Has technical skills but no market insight. Reads Reddit threads looking for complaints to build products around. Has launched 0-2 things before, at least one flopped because of no demand. Skeptical of 'idea validation' frameworks that are just surveys. Wants to see real people expressing real pain before they commit months to building.",
  research_passes: {
    pass1: {
      label: "Problem language",
      description: "How they describe the search for problems worth solving.",
      queries: [
        "how do you find problems worth solving",
        "reading Reddit to find startup ideas",
        "what are people complaining about that nobody is solving",
        "how to validate if there's real demand for my idea",
        "finding pain points to build a product around",
      ],
    },
    pass2: {
      label: "Emotional depth",
      description: "The pain of building the wrong thing, wasting months.",
      queries: [
        "built something nobody wanted and I could have known",
        "wasted months building a solution without validating demand",
        "everyone says validate first but how do you actually do it",
        "I keep finding ideas that already have ten competitors",
      ],
    },
    pass3: {
      label: "Failed solutions",
      description: "Tools that show trends but not pain: SparkToro, Google Trends, Exploding Topics.",
      queries: [
        "SparkToro shows audience data but not actual pain",
        "Google Trends too generic for finding specific demand",
        "tried reading Reddit forums for hours waste of time",
        "product validation tools are all surveys nobody fills out",
        "Exploding Topics shows trends but not whether people will pay",
      ],
    },
  },
  subreddits: [],
  queries: [
    "how do you find problems worth solving",
    "reading Reddit to find startup ideas",
    "what are people complaining about that nobody is solving",
    "how to validate if there's real demand for my idea",
    "finding pain points to build a product around",
    "built something nobody wanted and I could have known",
    "wasted months building a solution without validating demand",
    "everyone says validate first but how do you actually do it",
    "I keep finding ideas that already have ten competitors",
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
