#!/usr/bin/env node

/**
 * Generate a research brief using the Research Intel agent.
 *
 * Usage:
 *   # From collected evidence (requires prior ingestion):
 *   node scripts/generate-research-brief.mjs --context market-blindness
 *
 *   # From a new topic (generates hypothesis brief + discovery context):
 *   node scripts/generate-research-brief.mjs --topic "AI code review fatigue"
 *   node scripts/generate-research-brief.mjs --topic "AI code review fatigue" --description "Developers overwhelmed by AI-generated PR suggestions"
 *
 *   # Generate and seed a new context from the brief:
 *   node scripts/generate-research-brief.mjs --topic "AI code review fatigue" --seed-context
 *
 * Options:
 *   --context <id>       Analyze existing evidence for this context
 *   --topic <string>     Generate hypothesis brief for a new topic
 *   --description <str>  Additional context for topic mode
 *   --seed-context       Also create a discovery context from the brief
 *   --model <model>      Claude model to use (default: claude-sonnet-4-20250514)
 *   --limit <n>          Max evidence packets to include (default: 80)
 */

import "../src/db/migrate.mjs";
import { generateBriefFromEvidence, generateBriefFromIntelligence, generateBriefFromTopic, generateContextFromBrief } from "../src/agents/research-brief.mjs";
import { getDb } from "../src/db/connection.mjs";

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf("--" + name);
  if (idx === -1) return null;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes("--" + name);
}

const contextId = getArg("context");
const topic = getArg("topic");
const description = getArg("description");
const seedContext = hasFlag("seed-context");
const model = getArg("model");
const limit = getArg("limit") ? parseInt(getArg("limit")) : 80;

if (!contextId && !topic) {
  console.error("Usage:");
  console.error("  node scripts/generate-research-brief.mjs --context <context-id>");
  console.error("  node scripts/generate-research-brief.mjs --topic \"Your topic here\"");
  console.error("");
  console.error("Options:");
  console.error("  --description <text>   Additional context for topic mode");
  console.error("  --seed-context         Create a discovery context from the brief");
  console.error("  --model <model>        Claude model (default: claude-sonnet-4-20250514)");
  console.error("  --limit <n>            Max evidence packets (default: 80)");
  process.exit(1);
}

async function main() {
  const options = { model, evidenceLimit: limit, description };

  if (contextId) {
    console.log(`\nGenerating intelligence brief for context: ${contextId}`);
    console.log(`Model: ${model || "google/gemini-2.0-flash-001"}\n`);

    // Use intelligence-layer brief (falls back to raw evidence if no thread intel exists)
    const result = await generateBriefFromIntelligence(contextId, options);

    console.log("═".repeat(70));
    console.log(result.content);
    console.log("═".repeat(70));
    console.log(`\nBrief ID: ${result.id}`);
    console.log(`Mode: ${result.mode || "from_evidence"}`);
    console.log(`Evidence: ${result.evidenceCount} packets from ${result.communityCount} communities`);
    if (result.intelligenceStats) {
      const s = result.intelligenceStats;
      console.log(`Intelligence: ${s.signals} signals, ${s.threadsAnalyzed} threads analyzed, ${s.facets} facets, ${s.cases} cases`);
    }
    const usage = result.tokensUsed || {};
    console.log(`Tokens: ${usage.prompt_tokens || "?"} in / ${usage.completion_tokens || "?"} out`);

  } else if (seedContext) {
    console.log(`\nGenerating research brief + discovery context for: "${topic}"`);
    console.log(`Model: ${model || "claude-sonnet-4-20250514"}\n`);

    const result = await generateContextFromBrief(topic, options);

    console.log("═".repeat(70));
    console.log(result.brief);
    console.log("═".repeat(70));

    // Seed the context
    const db = getDb();
    const ctx = result.context;
    db.prepare(`
      INSERT OR REPLACE INTO contexts (id, label, description, subreddits, queries, high_intent, thesis, avatar, research_passes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ctx.id, ctx.label, ctx.description,
      JSON.stringify(ctx.subreddits),
      JSON.stringify(ctx.queries),
      JSON.stringify(ctx.high_intent),
      ctx.thesis,
      ctx.avatar,
      JSON.stringify(ctx.research_passes)
    );

    // Seed default source nodes
    const insertNode = db.prepare(
      `INSERT OR REPLACE INTO source_nodes (id, context_id, name, state, layers, lift, adds, cannot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const nodes = [
      { id: "reddit", name: "Reddit", state: "enabled", layers: ["conversation"], lift: 0, adds: "Pain language and repeated complaints.", cannot: "Cannot prove buying intent." },
      { id: "google-search", name: "Google Search", state: "available", layers: ["intent"], lift: 11, adds: "Active discovery intent.", cannot: "Cannot prove purchase." },
    ];
    for (const n of nodes) {
      insertNode.run(n.id + ":" + ctx.id, ctx.id, n.name, n.state, JSON.stringify(n.layers), n.lift, n.adds, n.cannot);
    }

    console.log(`\nBrief ID: ${result.briefId}`);
    console.log(`Context seeded: ${ctx.id}`);
    console.log(`  Queries: ${ctx.queries.length}`);
    console.log(`  Pass 1: ${ctx.research_passes.pass1.queries.length} queries`);
    console.log(`  Pass 2: ${ctx.research_passes.pass2.queries.length} queries`);
    console.log(`  Pass 3: ${ctx.research_passes.pass3.queries.length} queries`);
    console.log(`  High-intent: ${ctx.high_intent.length} keywords`);
    console.log(`\nNext: run discovery`);
    console.log(`  node scripts/discover-reddit-threads.mjs --context ${ctx.id}`);
    console.log(`  node scripts/ingest-discovered.mjs --context ${ctx.id}`);

  } else {
    console.log(`\nGenerating hypothesis research brief for: "${topic}"`);
    console.log(`Model: ${model || "claude-sonnet-4-20250514"}\n`);

    const result = await generateBriefFromTopic(topic, options);

    console.log("═".repeat(70));
    console.log(result.content);
    console.log("═".repeat(70));
    console.log(`\nBrief ID: ${result.id}`);
    console.log(`Tokens: ${result.tokensUsed.input_tokens} in / ${result.tokensUsed.output_tokens} out`);
    console.log(`\nTo create a discovery context from this brief, re-run with --seed-context`);
  }
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
