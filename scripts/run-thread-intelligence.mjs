#!/usr/bin/env node

/**
 * Thread Intelligence Pipeline — CLI entry point.
 *
 * Reconstructs Reddit threads from flat evidence packets, analyzes qualifying
 * threads via LLM, reconciles with regex findings, and detects signal cases.
 *
 * Usage:
 *   node scripts/run-thread-intelligence.mjs --context market-blindness
 *   node scripts/run-thread-intelligence.mjs --context market-blindness --dry-run
 *   node scripts/run-thread-intelligence.mjs --context market-blindness --limit 10
 *   node scripts/run-thread-intelligence.mjs --context market-blindness --reprocess
 *   node scripts/run-thread-intelligence.mjs --context market-blindness --model google/gemini-2.5-flash-preview
 *
 * Options:
 *   --context <id>     Context to analyze (required)
 *   --dry-run          Show thread stats without calling LLM
 *   --limit <n>        Max threads to analyze (budget cap)
 *   --threshold <n>    Min weighted evidence to qualify (default: 4.0)
 *   --reprocess        Re-analyze threads that already have intelligence
 *   --model <model>    OpenRouter model override
 */

import "../src/db/migrate.mjs";
import { reconstructThreads, qualifyThreads, storeThreads } from "../src/pipeline/thread-reconstructor.mjs";
import { analyzeThreadBatch, storeThreadIntelligence } from "../src/pipeline/thread-intelligence.mjs";
import { reconcileThread } from "../src/pipeline/thread-reconciler.mjs";
import { detectCases, storeCases } from "../src/pipeline/signal-cases.mjs";
import { refreshSignals } from "../src/pipeline/refresh-signals.mjs";
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
const dryRun = hasFlag("dry-run");
const reprocess = hasFlag("reprocess");
const limit = getArg("limit") ? parseInt(getArg("limit")) : null;
const threshold = getArg("threshold") ? parseFloat(getArg("threshold")) : 4.0;
const model = getArg("model");
const signalFilter = getArg("signal");
const communityFilter = getArg("community");

if (!contextId) {
  console.error("Usage: node scripts/run-thread-intelligence.mjs --context <context-id>");
  console.error("");
  console.error("Options:");
  console.error("  --dry-run          Show stats without LLM calls");
  console.error("  --limit <n>        Max threads to process");
  console.error("  --threshold <n>    Min weighted evidence (default: 4.0)");
  console.error("  --reprocess        Re-analyze existing");
  console.error("  --model <model>    OpenRouter model override");
  console.error("  --signal <id>      Only analyze threads linked to this signal");
  console.error("  --community <name> Only analyze threads from this community (e.g. r/SaaS)");
  process.exit(1);
}

async function main() {
  const db = getDb();

  // Verify context exists
  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(contextId);
  if (!context) {
    console.error(`Context not found: ${contextId}`);
    process.exit(1);
  }

  console.log(`\n═══ Thread Intelligence Pipeline ═══`);
  console.log(`Context: ${context.label} (${contextId})`);

  // --- Phase A: Reconstruct threads ---
  console.log(`\n--- Phase A: Thread Reconstruction ---`);
  let threads = reconstructThreads(contextId);
  console.log(`Reconstructed ${threads.length} threads`);

  if (threads.length === 0) {
    console.log("No threads found. Run ingestion first.");
    return;
  }

  // Apply --community filter
  if (communityFilter) {
    const comm = communityFilter.startsWith("r/") ? communityFilter : "r/" + communityFilter;
    threads = threads.filter(t => t.community && t.community.toLowerCase() === comm.toLowerCase());
    console.log(`Filtered to community ${comm}: ${threads.length} threads`);
  }

  // Apply --signal filter (only threads whose packets belong to this signal)
  if (signalFilter) {
    const signalEvidenceIds = new Set(
      db.prepare(`SELECT evidence_id FROM signal_evidence WHERE signal_id = ?`)
        .all(signalFilter).map(r => r.evidence_id)
    );
    threads = threads.filter(t => t.allPackets.some(p => signalEvidenceIds.has(p.id)));
    console.log(`Filtered to signal ${signalFilter}: ${threads.length} threads`);
  }

  // Store all threads
  storeThreads(threads);

  // Quality distribution
  const high = threads.filter(t => t.qualityTier === "high").length;
  const medium = threads.filter(t => t.qualityTier === "medium").length;
  const low = threads.filter(t => t.qualityTier === "low").length;
  console.log(`Quality: ${high} high, ${medium} medium, ${low} low`);

  // Qualify for LLM
  let qualified = qualifyThreads(threads, { minWeightedEvidence: threshold });
  console.log(`Qualifying for LLM (threshold ${threshold}): ${qualified.length} threads`);

  if (dryRun) {
    console.log(`\n--- Dry Run: Top qualifying threads ---`);
    const show = qualified.slice(0, 20);
    for (const t of show) {
      const rel = t.relevance.toFixed(1);
      console.log(`  ${t.qualityTier.toUpperCase().padEnd(6)} rel:${rel} ${t.community.padEnd(25)} ${t.commentCount} comments, score ${t.relevanceWeighted.toFixed(1)} — ${(t.title || "").slice(0, 50)}`);
    }
    if (qualified.length > 20) console.log(`  ... and ${qualified.length - 20} more`);
    console.log(`\nTo analyze, remove --dry-run`);
    return;
  }

  // --- Phase B: Thread Intelligence (LLM) ---
  console.log(`\n--- Phase B: Thread Intelligence (LLM) ---`);
  // Content hash deduplication handles skip-if-unchanged automatically.
  // --reprocess forces re-analysis even if content is the same.

  // Apply limit
  if (limit && qualified.length > limit) {
    console.log(`Capping at ${limit} threads (${qualified.length} qualified)`);
    qualified = qualified.slice(0, limit);
  }

  if (qualified.length === 0) {
    console.log("No new threads to analyze.");
  } else {
    console.log(`Analyzing ${qualified.length} threads via ${model || "google/gemini-2.0-flash-001"}...`);

    const { results, skipped, errors } = await analyzeThreadBatch(qualified, {
      model,
      maxConcurrency: 3,
      forceReprocess: reprocess,
      onProgress: ({ done, total, thread, error, wasSkipped }) => {
        if (error) {
          process.stdout.write(`  ✗ [${done}/${total}] ${error}\n`);
        } else if (wasSkipped) {
          process.stdout.write(`  ○ [${done}/${total}] ${thread} (unchanged)\n`);
        } else {
          process.stdout.write(`  ✓ [${done}/${total}] ${thread}\n`);
        }
      },
    });

    // Store results
    let totalTokens = 0;
    for (const result of results) {
      storeThreadIntelligence(result, contextId);
      totalTokens += result.tokensUsed || 0;
    }

    console.log(`\nResults: ${results.length} analyzed, ${skipped.length} unchanged (skipped), ${errors.length} errors`);
    if (totalTokens > 0) console.log(`Tokens used: ~${totalTokens}`);

    if (errors.length > 0) {
      console.log(`Errors:`);
      for (const e of errors) console.log(`  ${e.threadId}: ${e.error}`);
    }

    // Show sample insights
    if (results.length > 0) {
      console.log(`\n--- Sample Insights ---`);
      for (const r of results.slice(0, 3)) {
        const i = r.intelligence;
        console.log(`\n  Thread: ${r.threadId}`);
        console.log(`  Quality: ${i.signal_quality || "?"} | Awareness: ${i.awareness_level || "?"} | Desire: ${i.desire_type || "?"}`);
        if (i.key_insight) console.log(`  Key insight: ${i.key_insight}`);
        if (i.not_x_its_y?.length > 0) {
          const nxy = i.not_x_its_y[0];
          console.log(`  Not X, it's Y: "${nxy.surface}" → "${nxy.deeper}"`);
        }
        if (i.failed_solutions?.length > 0) {
          console.log(`  Failed solutions: ${i.failed_solutions.map(f => f.name).join(", ")}`);
        }
      }
    }
  }

  // --- Phase C: Reconciliation ---
  console.log(`\n--- Phase C: Reconciliation ---`);
  const analyzedThreads = db.prepare(
    `SELECT DISTINCT thread_id FROM thread_intelligence WHERE context_id = ?`
  ).all(contextId);

  let confirmed = 0, llmOnly = 0, regexOnly = 0;
  for (const { thread_id } of analyzedThreads) {
    const result = reconcileThread(thread_id, contextId);
    if (result.tier === "confirmed") confirmed++;
    else if (result.tier === "llm_only") llmOnly++;
    else regexOnly++;
  }
  console.log(`Confidence tiers: ${confirmed} confirmed, ${llmOnly} LLM-only, ${regexOnly} regex-only`);

  // --- Phase D: Refresh Signals ---
  console.log(`\n--- Phase D: Refresh Signals ---`);
  const { signalCount, updated } = refreshSignals(contextId);
  console.log(`Re-scored ${updated} signals with thread intelligence integrated`);

  // --- Phase E: Signal Cases ---
  console.log(`\n--- Phase E: Signal Cases ---`);
  const cases = detectCases(contextId);
  if (cases.length > 0) {
    const { stored, skippedMembers } = storeCases(cases, contextId);
    console.log(`Detected ${cases.length} signal cases (${stored} stored${skippedMembers ? `, ${skippedMembers} stale members skipped` : ""}):`);
    for (const c of cases) {
      console.log(`  "${c.title}" — ${c.signals.length} signals`);
      for (const s of c.signals) {
        console.log(`    - ${s.title}`);
      }
    }
  } else {
    console.log("No cross-community signal cases detected.");
  }

  console.log(`\n═══ Done ═══\n`);
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
