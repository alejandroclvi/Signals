#!/usr/bin/env node
/**
 * Autonomous research loop — adaptive evidence gathering.
 *
 * Usage:
 *   pnpm research <context-id>                          # 3 rounds (default)
 *   pnpm research <context-id> --rounds 5               # custom rounds
 *   pnpm research <context-id> --after 2026-04-14       # only posts after date
 *   pnpm research <context-id> --before 2026-04-21      # only posts before date
 *   pnpm research <context-id> --after 2026-04-14 --before 2026-04-21
 *   pnpm research <context-id> --agent content          # use content creator agent
 *   pnpm research <context-id> --agent ads              # use ad copywriter agent
 *   pnpm research <context-id> --agent competitive      # use competitive intel agent
 *   pnpm research <context-id> --agent product          # use product scout agent
 *   pnpm research <context-id> --assess                 # just assess coverage
 *   pnpm research <context-id> --queries                # generate adaptive queries (dry run)
 */

import { assessCoverage, generateAdaptiveQueries, runResearchLoop } from "../src/pipeline/research-director.mjs";

const contextId = process.argv[2];
if (!contextId) {
  console.error("Usage: pnpm research <context-id> [--rounds N] [--assess] [--queries]");
  process.exit(1);
}

const flags = process.argv.slice(3);
const assessOnly = flags.includes("--assess");
const queriesOnly = flags.includes("--queries");
const roundsIdx = flags.indexOf("--rounds");
const maxRounds = roundsIdx >= 0 ? parseInt(flags[roundsIdx + 1]) || 3 : 3;
const afterIdx = flags.indexOf("--after");
const afterDate = afterIdx >= 0 ? flags[afterIdx + 1] : undefined;
const beforeIdx = flags.indexOf("--before");
const beforeDate = beforeIdx >= 0 ? flags[beforeIdx + 1] : undefined;
const agentIdx = flags.indexOf("--agent");
const agentMode = agentIdx >= 0 ? flags[agentIdx + 1] : undefined;

if (assessOnly) {
  console.log(`\nAssessing coverage for: ${contextId}${agentMode ? ` (agent: ${agentMode})` : ""}\n`);
  const coverage = assessCoverage(contextId, { agentMode });

  console.log(`Total evidence: ${coverage.totalEvidence}`);
  console.log(`Balanced: ${coverage.isBalanced ? "Yes" : "No"}`);
  console.log(`Plateaued: ${coverage.isPlateaued ? "Yes" : "No"}`);

  if (Object.keys(coverage.stateDist).length > 0) {
    console.log(`\nState distribution:`);
    const total = coverage.totalEvidence;
    for (const [state, count] of Object.entries(coverage.stateDist).sort((a, b) => b[1] - a[1])) {
      const pct = Math.round(count / total * 100);
      const bar = "#".repeat(Math.round(pct / 2));
      console.log(`  ${state.padEnd(20)} ${String(pct).padStart(3)}% ${bar} (${count})`);
    }
  }

  if (coverage.gaps.length > 0) {
    console.log(`\nCoverage gaps:`);
    for (const g of coverage.gaps) {
      console.log(`  ${g.state.padEnd(20)} ${g.actualPct}% → target ${g.targetPct}% (deficit ${g.deficit}%)`);
    }
  }

  if (coverage.topTools.length > 0) {
    console.log(`\nTools mentioned: ${coverage.topTools.join(", ")}`);
  }

  console.log(`\nRecommendation: ${coverage.recommendation}`);
  process.exit(0);
}

if (queriesOnly) {
  console.log(`\nGenerating adaptive queries for: ${contextId}${agentMode ? ` (agent: ${agentMode})` : ""}\n`);
  const result = await generateAdaptiveQueries(contextId, { agentMode });

  console.log(`Reason: ${result.reason}`);
  if (result.queries.length > 0) {
    console.log(`\nQueries (${result.queries.length}):`);
    for (const q of result.queries) {
      console.log(`  [${q.targetState}] "${q.query}"`);
      if (q.rationale) console.log(`    → ${q.rationale}`);
    }
  }

  if (result.thesisCheck) {
    console.log(`\nThesis check: ${result.thesisCheck.status}`);
    if (result.thesisCheck.refinement) console.log(`  → ${result.thesisCheck.refinement}`);
  }

  process.exit(0);
}

// Full research loop
const timeInfo = afterDate || beforeDate
  ? ` (time window: ${afterDate || "∞"} → ${beforeDate || "∞"})`
  : "";
console.log(`\nStarting research loop for: ${contextId} (max ${maxRounds} rounds)${timeInfo}\n`);

const result = await runResearchLoop(contextId, {
  maxRounds,
  afterDate,
  beforeDate,
  agentMode,
  onProgress: (event) => {
    const prefix = event.round ? `[Round ${event.round}]` : "[Loop]";
    console.log(`${prefix} ${event.message}`);
  },
});

console.log(`\n=== Research Loop Complete ===`);
console.log(`Rounds: ${result.rounds}`);
console.log(`Total new evidence: ${result.totalEvidence}`);
console.log(`Remaining gaps: ${result.finalCoverage.gaps.length}`);

if (result.decisions.length > 0) {
  console.log(`\nDecision log:`);
  for (const d of result.decisions) {
    console.log(`  Round ${d.round}: +${d.evidenceAdded} evidence, ${d.queriesUsed} queries, ${d.gapsBefore}→${d.gapsAfter} gaps`);
  }
}
