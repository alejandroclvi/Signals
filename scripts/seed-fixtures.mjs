/**
 * Seed the SQLite database with fixture data from the prototype.
 * Run: npm run seed
 */
import { getDb } from "../src/db/connection.mjs";
import { classifyIntent } from "../src/pipeline/normalizer.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure migration ran first
const migrateScript = path.resolve(__dirname, "../src/db/migrate.mjs");
await import(migrateScript);

const db = getDb();

// ------------------------------------------------------------------
// Fixture data — law firms (default, inline in prototype)
// ------------------------------------------------------------------

const lawFirmsContext = {
  id: "law-firms",
  label: "AI tools for small law firms",
  description: "Monitor AI adoption, discovery tools, and practice management alternatives for small law firms.",
  subreddits: JSON.stringify(["r/LawFirm", "r/legaltech", "r/solo_practice", "r/LawSchool", "r/paralegal"]),
  queries: JSON.stringify(["AI legal", "alternative to Clio", "discovery summarize"]),
  high_intent: JSON.stringify(["alternative to Clio", "summarize discovery", "AI for legal docs", "would pay for"]),
};

const lawFirmsSignals = [
  {
    id: "ai-discovery", rank: 1, status: "Emerging", title: "AI discovery summaries",
    growth: "+312%", tags: ["demand", "adoption"],
    summary: "Solo attorneys are asking how to summarize discovery documents while preserving confidentiality.",
    communities: ["r/LawFirm", "r/legaltech", "r/paralegal"],
    mentions: 21, comments: 188, confidence: "High",
    x: 704, y: 93, r: 41, volume: 289,
    why: "Conversation is moving from curiosity to workflow-specific adoption. Users are asking about confidentiality, document volume, and how to integrate AI into legal review, shifting from \"is this possible\" toward \"which tool handles my caseload.\"",
    suggested_title: "Suggested action", suggested_sub: "Create alert for confidentiality + discovery summary discussions.",
    next: "Enable Google Search next to validate active discovery and vendor comparison intent.",
    evidence: [
      { id: "81", quote: "Has anyone used AI to summarize discovery docs without uploading client data?", source: "r/LawFirm", author: "u/solopractice_atl", age: "2d", score: 147, replies: 62 },
      { id: "82", quote: "I need something cheaper than hiring extra review help. We are drowning in exhibits.", source: "r/legaltech", author: "u/partner_ops", age: "4d", score: 89, replies: 31 },
      { id: "83", quote: "We tried using a general AI tool, but confidentiality is the blocker.", source: "r/paralegal", author: "u/para_j", age: "6d", score: 213, replies: 94 },
      { id: "84", quote: "Looking for on-prem or SOC 2 options that can handle 10k+ page productions.", source: "r/LawFirm", author: "u/litigator_nm", age: "7d", score: 76, replies: 28 },
    ],
    phrases: [["summarize discovery", 47], ["client confidentiality", 38], ["legal document review", 31], ["AI for case prep", 24], ["alternative to manual review", 19], ["SOC 2 legal AI", 14], ["on-prem summarization", 11]],
    spread: [["r/LawFirm", 42], ["r/legaltech", 28], ["r/paralegal", 18], ["r/solo_practice", 12]],
    related: [["Confidentiality concerns", "narrative", "r=0.84"], ["Legal document review", "demand", "r=0.71"], ["Paralegal workflow AI", "adoption", "r=0.62"]],
  },
  {
    id: "alternative-clio", rank: 2, status: "Growing", title: "Alternative to Clio",
    growth: "+146%", tags: ["frustration", "comparison"],
    summary: "Users are comparing legal practice tools around cost, complexity, and automation gaps.",
    communities: ["r/solo_practice", "r/LawFirm"],
    mentions: 14, comments: 96, confidence: "Medium",
    x: 641, y: 169, r: 24, volume: 110,
    why: "The signal is less about replacing a brand and more about small firms wanting narrower automation without large-suite overhead.",
    suggested_title: "Suggested action", suggested_sub: "Enable HN or GitHub only if this becomes a technical tooling signal.",
    next: "Enable Google Search to check comparison and alternative queries.",
    evidence: [
      { id: "91", quote: "Clio is fine but feels too heavy for a two-person practice.", source: "r/solo_practice", author: "u/founder_attorney", age: "1d", score: 64, replies: 18 },
      { id: "92", quote: "I want intake, billing, and follow-up automation without paying for the whole suite.", source: "r/LawFirm", author: "u/smallfirm_ops", age: "5d", score: 52, replies: 17 },
    ],
    phrases: [["alternative to Clio", 29], ["practice management too expensive", 17], ["small firm automation", 14]],
    spread: [["r/solo_practice", 48], ["r/LawFirm", 34], ["r/legaltech", 18]],
    related: [["Client intake automation", "demand", "r=0.68"], ["Billable hour compression", "economic", "r=0.52"]],
  },
  {
    id: "client-intake", rank: 3, status: "Watch", title: "Client intake automation",
    growth: "+88%", tags: ["demand"],
    summary: "Small firms are asking for intake workflows that connect forms, email, and document generation.",
    communities: ["r/legaltech", "r/smallbusiness"],
    mentions: 9, comments: 61, confidence: "Medium",
    x: 602, y: 305, r: 23, volume: 88,
    why: "The pain is operational and repetitive. Evidence is still early but practical enough to justify watching intent sources.",
    suggested_title: "Suggested action", suggested_sub: "Create alert for intake + forms + document generation.",
    next: "Enable Google Search to validate active intent.",
    evidence: [
      { id: "101", quote: "Is there a simple intake form that creates the first email and document checklist?", source: "r/legaltech", author: "u/intake_ops", age: "3d", score: 41, replies: 19 },
      { id: "102", quote: "We lose too much time copying client answers into templates.", source: "r/smallbusiness", author: "u/localfirm", age: "8d", score: 37, replies: 12 },
    ],
    phrases: [["client intake automation", 18], ["forms to docs", 12], ["intake follow-up", 9]],
    spread: [["r/legaltech", 43], ["r/smallbusiness", 34], ["r/LawFirm", 23]],
    related: [["AI discovery summaries", "demand", "r=0.46"], ["Alternative to Clio", "comparison", "r=0.48"]],
  },
  {
    id: "confidentiality", rank: 4, status: "Growing", title: "Confidentiality concerns",
    growth: "+127%", tags: ["narrative"],
    summary: "Threads debate where client data can safely flow through AI tools, especially for litigation prep.",
    communities: ["r/LawFirm", "r/lawyertalk"],
    mentions: 18, comments: 142, confidence: "High",
    x: 670, y: 178, r: 26, volume: 92,
    why: "Confidentiality is becoming a category constraint. This can shape vendor selection and product requirements before buying intent is visible.",
    suggested_title: "Suggested action", suggested_sub: "Create a watchlist for security-language acceleration.",
    next: "Enable primary-source/vendor pages to compare security claims.",
    evidence: [
      { id: "111", quote: "The feature is useful, but where does the client data go?", source: "r/LawFirm", author: "u/riskpartner", age: "2d", score: 128, replies: 44 },
      { id: "112", quote: "I need a vendor answer on retention before I let staff use AI on case material.", source: "r/lawyertalk", author: "u/legaladmin", age: "9d", score: 77, replies: 27 },
    ],
    phrases: [["client data", 42], ["AI retention policy", 21], ["confidentiality blocker", 18]],
    spread: [["r/LawFirm", 52], ["r/lawyertalk", 30], ["r/paralegal", 18]],
    related: [["AI discovery summaries", "adoption", "r=0.84"], ["SOC 2 legal AI", "narrative", "r=0.69"]],
  },
  {
    id: "billable-compression", rank: 5, status: "Watch", title: "Billable hour compression",
    growth: "+74%", tags: ["economic"],
    summary: "Partners note clients pushing back on research hours as AI shortens review time.",
    communities: ["r/BigLaw", "r/LawFirm"],
    mentions: 11, comments: 74, confidence: "Medium",
    x: 528, y: 270, r: 19, volume: 77,
    why: "The discussion connects workflow automation to pricing pressure. It is not yet product demand, but it points to economic commitment questions.",
    suggested_title: "Suggested action", suggested_sub: "Watch for jobs and buyer-review evidence later.",
    next: "Enable G2 or jobs data later to validate economic commitment.",
    evidence: [
      { id: "121", quote: "Clients are asking why research hours are still high if we use AI tools.", source: "r/BigLaw", author: "u/seniorassoc", age: "6d", score: 53, replies: 22 },
      { id: "122", quote: "Flat-fee pressure is becoming part of every tech conversation.", source: "r/LawFirm", author: "u/managingpartner", age: "12d", score: 31, replies: 11 },
    ],
    phrases: [["billable compression", 11], ["research hours", 19], ["flat fee pressure", 8]],
    spread: [["r/BigLaw", 50], ["r/LawFirm", 34], ["r/legaltech", 16]],
    related: [["Alternative to Clio", "comparison", "r=0.39"], ["AI discovery summaries", "economic", "r=0.44"]],
  },
  {
    id: "legal-doc-review", rank: 6, status: "Steady", title: "Legal document review",
    growth: "+54%", tags: ["demand"],
    summary: "Ongoing demand for batch-review tools that handle PDFs, contracts, and exhibits.",
    communities: ["r/paralegal", "r/LawFirm"],
    mentions: 16, comments: 112, confidence: "High",
    x: 575, y: 236, r: 22, volume: 138,
    why: "The pain is well-defined but broader than the strongest emerging category. It provides supporting evidence for discovery-summary demand.",
    suggested_title: "Suggested action", suggested_sub: "Attach as supporting evidence to discovery summaries.",
    next: "Enable GitHub only if open tooling becomes visible.",
    evidence: [
      { id: "131", quote: "I need batch review for PDFs, not another chat box.", source: "r/paralegal", author: "u/docreview", age: "10d", score: 88, replies: 36 },
      { id: "132", quote: "Contract review is useful, discovery review is where the time goes.", source: "r/LawFirm", author: "u/litigationops", age: "14d", score: 67, replies: 24 },
    ],
    phrases: [["batch PDF review", 22], ["legal document review", 31], ["not another chatbot", 13]],
    spread: [["r/paralegal", 45], ["r/LawFirm", 39], ["r/legaltech", 16]],
    related: [["AI discovery summaries", "demand", "r=0.71"], ["Confidentiality concerns", "narrative", "r=0.53"]],
  },
];

const lawFirmsSourceNodes = [
  { id: "reddit", name: "Reddit", state: "enabled", layers: ["conversation"], lift: 0, adds: "Pain language and repeated complaints.", cannot: "Cannot prove buying intent, budget, or adoption." },
  { id: "google-search", name: "Google Search", state: "available", layers: ["intent"], lift: 11, adds: "Active discovery and comparison intent.", cannot: "Cannot prove purchase or retention." },
  { id: "google-trends", name: "Google Trends", state: "gated", layers: ["intent"], lift: 8, adds: "Broad search-demand direction.", cannot: "Weak for very early small signals." },
  { id: "hacker-news", name: "Hacker News", state: "available", layers: ["conversation"], lift: 7, adds: "Builder debate and technical skepticism.", cannot: "Narrow audience, not broad demand." },
  { id: "github", name: "GitHub", state: "available", layers: ["behavior"], lift: 9, adds: "Implementation artifacts and developer adoption.", cannot: "Cannot prove buyer budget." },
  { id: "linkedin", name: "LinkedIn", state: "gated", layers: ["conversation", "economic"], lift: 8, adds: "Professional normalization and hiring signals.", cannot: "Access constraints limit full public coverage." },
  { id: "g2-jobs", name: "G2 / Jobs", state: "gated", layers: ["economic"], lift: 10, adds: "Buyer reviews, categories, and hiring commitment.", cannot: "Usually later than early pain signals." },
  { id: "polymarket", name: "Polymarket", state: "available", layers: ["expectation"], lift: 6, adds: "Money-backed probability movement.", cannot: "Not useful for every product-category question." },
  { id: "stocks", name: "Stock Prices", state: "available", layers: ["capital"], lift: 6, adds: "Capital-market response and divergence.", cannot: "Cannot prove causality by itself." },
  { id: "primary", name: "Primary Sources", state: "available", layers: ["truth"], lift: 10, adds: "Official confirmation, filings, docs, vendor claims.", cannot: "Often validates later than social discovery." },
];

const lawFirmsFixtureMeta = {
  id: "default",
  label: "Law firms replay",
  context_id: "law-firms",
  crumbs: "Radar / Law firms",
  period: "last 30d",
  topic_count: 15,
  selected_id: "ai-discovery",
  other_bubbles: [
    { x: 390, y: 143, r: 14, color: "#1b918d", opacity: .25 },
    { x: 251, y: 245, r: 10, color: "#875fb4", opacity: .15 },
    { x: 317, y: 318, r: 10, color: "#de5c56", opacity: .13 },
    { x: 462, y: 275, r: 13, color: "#2d6fbb", opacity: .25 },
    { x: 359, y: 210, r: 14, color: "#1b918d", opacity: .22 },
    { x: 488, y: 337, r: 13, color: "#875fb4", opacity: .24 },
    { x: 244, y: 416, r: 10, color: "#3e9558", opacity: .14 },
    { x: 335, y: 397, r: 9, color: "#2d6fbb", opacity: .18 },
    { x: 536, y: 306, r: 14, color: "#3e9558", opacity: .2 },
  ],
  metrics: [
    { title: "Emerging signals", value: "24", delta: "+6", caption: "detected this period", spark: [12, 13, 16, 18, 23, 26, 31] },
    { title: "High-confidence", value: "7", delta: "+2", caption: "evidence >= 3 sources", spark: [4, 5, 6, 8, 9, 11, 12] },
    { title: "Communities monitored", value: "38", delta: "-", caption: "in active context", spark: [19, 19, 24, 24, 24, 24, 24] },
    { title: "Saved evidence", value: "156", delta: "+34", caption: "threads + comments", spark: [76, 88, 104, 121, 139, 151, 156] },
  ],
  timeline: {
    posts: [17, 18, 15, 17, 18, 16, 19, 16, 17, 19, 18, 19, 17, 18, 19, 18, 18, 20, 22, 25, 29, 35, 39, 46, 58, 69],
    comments: [14, 13, 12, 14, 15, 14, 15, 14, 13, 15, 15, 16, 14, 15, 16, 15, 14, 16, 18, 20, 24, 27, 31, 36, 41, 44],
    authors: [9, 9, 8, 10, 9, 10, 9, 11, 10, 10, 11, 11, 10, 12, 11, 12, 12, 13, 13, 14, 15, 16, 18, 20, 22, 24],
  },
  heatmap: [
    ["r/LawFirm", [16, 23, 5, 29]],
    ["r/legaltech", [9, 17, 22, 25]],
    ["r/solo_practice", [10, 10, 14, 23]],
    ["r/paralegal", [14, 15, 5, 23]],
    ["r/LawSchool", [0, 10, 7, 18]],
  ],
  intent: [
    ["Tool search", 31, "#3e9558"],
    ["Frustration", 26, "#de5c56"],
    ["Adoption", 18, "#2d6fbb"],
    ["Comparison", 15, "#bd842f"],
    ["Education", 7, "#875fb4"],
    ["Speculation", 3, "#1b918d"],
  ],
};

// ------------------------------------------------------------------
// Founder AI tools fixture — load from the prototype fixture file
// ------------------------------------------------------------------

// We need to parse the fixture JS file. It assigns to window.signalRadarFixtures.
// We'll eval it in a sandboxed context.
const fixtureFilePath = path.resolve(__dirname, "../dashboard-prototype/fixtures/reddit-category-pain-radar.fixture.js");
const fixtureCode = fs.readFileSync(fixtureFilePath, "utf-8");
const fakeWindow = {};
const fn = new Function("window", fixtureCode);
fn(fakeWindow);
const founderFixtureRaw = (fakeWindow.signalRadarFixtures || [])[0];

const founderContext = {
  id: "founders",
  label: "AI tools for founders",
  description: "Monitor AI tools, agent frameworks, CRM, and pricing tools for startup founders.",
  subreddits: JSON.stringify(["r/startups", "r/Entrepreneur", "r/SaaS", "r/ChatGPT", "r/ProductManagement"]),
  queries: JSON.stringify(["AI research agent", "AI CRM", "pricing advisor"]),
  high_intent: JSON.stringify(["research assistant", "competitor monitoring", "CRM follow up"]),
};

// ------------------------------------------------------------------
// Insert functions
// ------------------------------------------------------------------

const insertContext = db.prepare(
  "INSERT OR REPLACE INTO contexts (id, label, description, subreddits, queries, high_intent) VALUES (?, ?, ?, ?, ?, ?)"
);

const insertSignal = db.prepare(
  `INSERT OR REPLACE INTO signals
   (id, context_id, rank, status, title, growth, tags, summary, communities,
    mentions, comments, confidence, volume, why, suggested_title, suggested_sub,
    next_source, dominant_intent, intent_mix, bubble_x, bubble_y, bubble_r)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const insertEvidence = db.prepare(
  `INSERT OR REPLACE INTO evidence_packets
   (id, context_id, source_id, source_layer, source_item_id, url, title, body,
    author_ref, community, observed_at, published_at, metrics, topics, raw_ref, intent)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

function seedSignals(contextId, signalDefs) {
  for (const s of signalDefs) {
    // Compute intent from evidence if not provided
    const intentCounts = {};
    if (s.evidence) {
      for (const e of s.evidence) {
        if (typeof e !== "string" && !e.packet_id) {
          const intent = e.intent || classifyIntent("", e.quote || "");
          intentCounts[intent] = (intentCounts[intent] || 0) + 1;
        }
      }
    }
    const dominantIntent = s.dominant_intent || (
      Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "question"
    );
    const intentMix = s.intent_mix || (Object.keys(intentCounts).length ? intentCounts : { [dominantIntent]: s.mentions || 1 });

    insertSignal.run(
      s.id, contextId, s.rank, s.status, s.title, s.growth,
      JSON.stringify(s.tags), s.summary, JSON.stringify(s.communities),
      s.mentions, s.comments, s.confidence, s.volume, s.why,
      s.suggested_title || (s.suggested && s.suggested.title) || "Suggested action",
      s.suggested_sub || (s.suggested && s.suggested.sub) || "",
      s.next || s.next_source || "",
      dominantIntent,
      JSON.stringify(intentMix),
      s.x || s.bubble_x || 0,
      s.y || s.bubble_y || 0,
      s.r || s.bubble_r || 0
    );

    // Evidence — inline style (law firms) or packet-reference style (founders)
    if (s.evidence) {
      for (const e of s.evidence) {
        if (typeof e === "string") {
          insertSignalEvidence.run(s.id, e);
        } else if (e.packet_id) {
          insertSignalEvidence.run(s.id, e.packet_id);
        } else {
          const eid = "inline:" + contextId + ":" + s.id + ":" + e.id;
          const intent = e.intent || classifyIntent("", e.quote || "");
          insertEvidence.run(
            eid, contextId, e.source_id || "reddit", e.source_layer || "conversation", e.id, e.url || "#",
            "", e.quote, e.author, e.source,
            null, null,
            JSON.stringify({ score: e.score || 0, comments: e.replies || 0 }),
            JSON.stringify([]), null, intent
          );
          insertSignalEvidence.run(s.id, eid);
        }
      }
    }

    // Phrases
    if (s.phrases) {
      for (const [phrase, count] of s.phrases) {
        insertPhrase.run(s.id, phrase, count);
      }
    }

    // Spread
    if (s.spread) {
      for (const [community, pct] of s.spread) {
        insertSpread.run(s.id, community, pct);
      }
    }

    // Related
    if (s.related) {
      for (const [label, tag, score] of s.related) {
        insertRelated.run(s.id, label, tag, score);
      }
    }
  }
}

function seedSourceNodes(contextId, nodes) {
  for (const n of nodes) {
    insertSourceNode.run(
      n.id + ":" + contextId, contextId, n.name, n.state,
      JSON.stringify(n.layers), n.lift, n.adds, n.cannot
    );
  }
}

function seedFixtureMeta(meta) {
  insertFixtureMeta.run(
    meta.id, meta.label, meta.context_id,
    meta.crumbs, meta.period, meta.topic_count, meta.selected_id,
    JSON.stringify(meta.other_bubbles), JSON.stringify(meta.metrics),
    JSON.stringify(meta.timeline), JSON.stringify(meta.heatmap),
    JSON.stringify(meta.intent)
  );
}

// ------------------------------------------------------------------
// Run the seed
// ------------------------------------------------------------------

const seed = db.transaction(() => {
  // Clear existing data
  db.exec("DELETE FROM signal_related");
  db.exec("DELETE FROM signal_spread");
  db.exec("DELETE FROM signal_phrases");
  db.exec("DELETE FROM signal_evidence");
  db.exec("DELETE FROM evidence_packets");
  db.exec("DELETE FROM signals");
  db.exec("DELETE FROM source_nodes");
  db.exec("DELETE FROM fixture_meta");
  db.exec("DELETE FROM contexts");

  // --- Law firms ---
  insertContext.run(
    lawFirmsContext.id, lawFirmsContext.label, lawFirmsContext.description,
    lawFirmsContext.subreddits, lawFirmsContext.queries, lawFirmsContext.high_intent
  );
  seedSignals("law-firms", lawFirmsSignals);
  seedSourceNodes("law-firms", lawFirmsSourceNodes);
  seedFixtureMeta(lawFirmsFixtureMeta);

  // --- Founders ---
  if (founderFixtureRaw) {
    insertContext.run(
      founderContext.id, founderContext.label, founderContext.description,
      founderContext.subreddits, founderContext.queries, founderContext.high_intent
    );

    // Insert evidence packets first
    if (founderFixtureRaw.evidencePackets) {
      for (const ep of founderFixtureRaw.evidencePackets) {
        const epIntent = ep.intent || classifyIntent(ep.title || "", ep.body || "");
        insertEvidence.run(
          ep.id, "founders", ep.source_id, ep.source_layer, ep.source_item_id,
          ep.url || "#", ep.title || "", ep.body || "", ep.author_ref || "",
          ep.community || "", ep.observed_at || null, ep.published_at || null,
          JSON.stringify(ep.metrics || {}), JSON.stringify(ep.topics || []),
          ep.raw_ref || null, epIntent
        );
      }
    }

    seedSignals("founders", founderFixtureRaw.signals || []);
    seedSourceNodes("founders", founderFixtureRaw.sourceNodes || []);

    seedFixtureMeta({
      id: founderFixtureRaw.id || "founder-ai-tools",
      label: founderFixtureRaw.label || "Founder AI tools replay",
      context_id: "founders",
      crumbs: founderFixtureRaw.crumbs || "Radar / Founders",
      period: founderFixtureRaw.period || "last 21d",
      topic_count: founderFixtureRaw.topicCount || 11,
      selected_id: founderFixtureRaw.selectedId || "founder-research-agent",
      other_bubbles: founderFixtureRaw.otherBubbles || [],
      metrics: founderFixtureRaw.metrics || [],
      timeline: founderFixtureRaw.timeline || {},
      heatmap: founderFixtureRaw.heatmap || [],
      intent: founderFixtureRaw.intent || [],
    });
  }

  console.log("Seeded: law-firms context with " + lawFirmsSignals.length + " signals");
  if (founderFixtureRaw) {
    console.log("Seeded: founders context with " + (founderFixtureRaw.signals || []).length + " signals");
  }
});

seed();
console.log("Seed complete.");
