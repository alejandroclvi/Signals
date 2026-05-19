#!/usr/bin/env node

/**
 * Seed the claude-code-news-radar context — designed to surface EARLY
 * trending signals about Claude Code news/features, not generic adoption
 * complaints. Queries hunt for three things:
 *
 *   1. Announcement language ("just shipped", "now supports", "can now")
 *   2. Feature-name probes (subagents, MCP, hooks, plan mode, skills, fast mode)
 *   3. Behavior-change observations ("anyone else notice", "different today")
 *
 * Avatar: senior engineers + solo founders who use Claude Code daily for
 * production work — they notice feature changes within hours because their
 * workflow depends on them, and they post unfiltered reactions in r/ClaudeCode,
 * r/ClaudeAI, and HN before any review piece exists.
 */

import "../src/db/migrate.mjs";
import { getDb } from "../src/db/connection.mjs";

const CONTEXT = {
  id: "claude-code-news-radar",
  label: "Claude Code News & Features Radar",
  description: "Early-trending detector for Claude Code features, releases, and behavior changes — surfaces what's shipping before mainstream coverage catches up.",
  agent_mode: "research",
  thesis: "Anthropic ships Claude Code features faster than reviews/coverage catch up. Senior engineers and solo founders using Claude Code daily for production work notice feature changes within hours — their workflow depends on them. They post unfiltered first-reactions on r/ClaudeCode, r/ClaudeAI, and HN before any blog/marketing piece exists. By detecting (a) feature-name mentions, (b) announcement language, and (c) behavior-change observations within days of release, we can surface what's shipping (what works, what breaks) before it's obvious.",
  avatar: "Senior software engineers (5+ yrs) and solo technical founders who use Claude Code daily in production. They have strong opinions about tooling, run the latest builds, switch between Claude Code / Cursor / Copilot, and post short, opinionated reactions when things change. Active in r/ClaudeCode, r/ClaudeAI, HN. Their language is technical and specific — they name features, version numbers, and behaviors precisely.",
  subreddits: [
    "ClaudeCode",
    "ClaudeAI",
    "claude",
    "vibecoding",
    "GithubCopilot",
    "cursor",
    "LocalLLaMA",
    "programming",
    "ChatGPTCoding",
    "OpenAI",
    "MachineLearning",
    "ExperiencedDevs",
  ],
  queries: [
    // ── Announcement / release language ─────────────────────────────────
    "claude code just released",
    "claude code new feature",
    "claude code can now",
    "claude code update today",
    "claude code now supports",
    "claude code just added",
    "claude code rolled out",
    "claude code just shipped",
    "anthropic just announced claude code",
    "new in claude code",
    "claude code beta",
    "claude code preview",
    "claude code changelog",

    // ── Feature-name probes ─────────────────────────────────────────────
    "claude code subagents",
    "claude code MCP server",
    "claude code hooks",
    "claude code plan mode",
    "claude code memory feature",
    "claude code skills",
    "claude code background tasks",
    "claude code fast mode",
    "claude code IDE extension",
    "claude code agent SDK",
    "claude code web app",
    "claude code 1M context",
    "claude code slash command",
    "claude code custom command",

    // ── Behavior change / first reactions ──────────────────────────────
    "anyone else notice claude code",
    "claude code different today",
    "since the latest claude code update",
    "first impression claude code",
    "tried the new claude code",
    "claude code seems better",
    "claude code seems worse",
    "claude code is broken since",

    // ── Comparison shifts ───────────────────────────────────────────────
    "switched to claude code from cursor",
    "claude code now better than cursor",
    "claude code vs cursor 2026",
  ],
  high_intent: [
    "just shipped", "now supports", "rolled out", "introducing",
    "new feature", "beta", "preview", "changelog",
  ],
};

const SOURCE_NODES = [
  { id: "reddit",     name: "Reddit",        state: "enabled",  layers: ["conversation"], lift: 0,  adds: "Unfiltered first-reaction posts in r/ClaudeCode and r/ClaudeAI — the fastest signal layer for feature changes.", cannot: "Cannot prove adoption breadth outside the active subset." },
  { id: "hackernews", name: "Hacker News",   state: "enabled",  layers: ["conversation"], lift: 7,  adds: "Builder technical debate, deeper-look posts, contrarian takes when a feature lands.", cannot: "Narrow audience, skews toward critique." },
  { id: "google",     name: "Google Search", state: "available", layers: ["intent"],       lift: 11, adds: "Active discovery — what people are searching for after they hear about a feature.", cannot: "Lagging signal (searches happen after announcement)." },
  { id: "github",     name: "GitHub",        state: "available", layers: ["behavior"],     lift: 9,  adds: "Anthropic releases + community plugins/extensions. Behavior signal for actual usage.", cannot: "Lags Reddit for feature reactions." },
];

const db = getDb();

const insertContext = db.prepare(
  `INSERT OR REPLACE INTO contexts (id, label, description, subreddits, queries, high_intent, thesis, avatar, agent_mode)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const insertNode = db.prepare(
  `INSERT OR REPLACE INTO source_nodes (id, context_id, name, state, layers, lift, adds, cannot)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

insertContext.run(
  CONTEXT.id,
  CONTEXT.label,
  CONTEXT.description,
  JSON.stringify(CONTEXT.subreddits),
  JSON.stringify(CONTEXT.queries),
  JSON.stringify(CONTEXT.high_intent),
  CONTEXT.thesis,
  CONTEXT.avatar,
  CONTEXT.agent_mode,
);

for (const n of SOURCE_NODES) {
  insertNode.run(
    n.id + ":" + CONTEXT.id,
    CONTEXT.id,
    n.name,
    n.state,
    JSON.stringify(n.layers),
    n.lift,
    n.adds,
    n.cannot,
  );
}

console.log(`Seeded context: ${CONTEXT.id}`);
console.log(`  ${CONTEXT.subreddits.length} subreddits, ${CONTEXT.queries.length} queries, ${SOURCE_NODES.length} source nodes`);
console.log();
console.log("Next:");
console.log(`  node scripts/discover-reddit-threads.mjs --context ${CONTEXT.id} --after 2026-04-15`);
console.log(`  node scripts/ingest-discovered.mjs --context ${CONTEXT.id}`);
console.log(`  pnpm ingest:multi ${CONTEXT.id} --producer hackernews --after 2026-04-15`);
