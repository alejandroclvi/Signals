#!/usr/bin/env node

/**
 * Smoke test — validates database health, context integrity, and evidence quality.
 *
 * Usage: node scripts/smoke-test.mjs
 *        pnpm test:smoke
 *
 * Exit code 0 = all checks pass, 1 = failures found.
 */

import { getDb } from "../src/db/connection.mjs";
import "../src/db/migrate.mjs";
import { communityRelevance } from "../src/pipeline/community-relevance.mjs";

const db = getDb();
let failures = 0;
let passes = 0;

function check(label, condition, detail) {
  if (condition) {
    passes++;
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? " — " + detail : ""}`);
  }
}

// --- Database opens ---
console.log("\n== Database ==");
check("Database opens", !!db, "Could not open data/signals.db");

// --- Contexts ---
console.log("\n== Contexts ==");
const contexts = db.prepare("SELECT * FROM contexts").all();
check("At least 1 context exists", contexts.length > 0, `Found ${contexts.length}`);

for (const ctx of contexts) {
  const queries = JSON.parse(ctx.queries || "[]");
  const evidence = db.prepare("SELECT COUNT(*) as c FROM evidence_packets WHERE context_id = ?").get(ctx.id);
  const signals = db.prepare("SELECT COUNT(*) as c FROM signals WHERE context_id = ?").get(ctx.id);
  const nodes = db.prepare("SELECT COUNT(*) as c FROM source_nodes WHERE context_id = ?").get(ctx.id);

  check(`${ctx.id}: has queries (${queries.length})`, queries.length > 0 || ctx.id === "market-signals");
  check(`${ctx.id}: has source nodes (${nodes.c})`, nodes.c >= 3, `Only ${nodes.c} source nodes`);
}

// --- Evidence integrity ---
console.log("\n== Evidence Integrity ==");
const totalEvidence = db.prepare("SELECT COUNT(*) as c FROM evidence_packets").get().c;
check(`Total evidence: ${totalEvidence}`, totalEvidence > 0);

const nullSourceKind = db.prepare("SELECT COUNT(*) as c FROM evidence_packets WHERE source_kind IS NULL").get().c;
check(`All evidence has source_kind`, nullSourceKind === 0, `${nullSourceKind} packets missing source_kind`);

const shortBody = db.prepare("SELECT COUNT(*) as c FROM evidence_packets WHERE LENGTH(body) < 20").get().c;
check(`No ultra-short evidence bodies`, shortBody === 0, `${shortBody} packets with body < 20 chars`);

// --- Relevance quality ---
console.log("\n== Relevance Quality ==");
const irrelevantEvidence = db.prepare(`
  SELECT community, COUNT(*) as c FROM evidence_packets
  GROUP BY community
`).all();

const badCommunities = irrelevantEvidence.filter(r => communityRelevance(r.community) <= 0.2);
const badCount = badCommunities.reduce((s, r) => s + r.c, 0);
check(`No irrelevant community evidence`, badCount === 0,
  badCount > 0 ? `${badCount} packets in ${badCommunities.length} irrelevant communities: ${badCommunities.slice(0, 5).map(r => r.community).join(", ")}` : ""
);

// --- Signal integrity ---
console.log("\n== Signal Integrity ==");
const totalSignals = db.prepare("SELECT COUNT(*) as c FROM signals").get().c;
check(`Total signals: ${totalSignals}`, totalSignals > 0);

const orphanedSignals = db.prepare(`
  SELECT COUNT(*) as c FROM signals s
  LEFT JOIN signal_evidence se ON se.signal_id = s.id
  WHERE se.signal_id IS NULL
`).get().c;
check(`No orphaned signals (no evidence)`, orphanedSignals === 0, `${orphanedSignals} signals have no linked evidence`);

const duplicateRanks = db.prepare(`
  SELECT context_id, rank, COUNT(*) as c FROM signals
  GROUP BY context_id, rank HAVING COUNT(*) > 1
`).all();
check(`No duplicate ranks`, duplicateRanks.length === 0,
  duplicateRanks.length > 0 ? duplicateRanks.map(r => `${r.context_id} rank ${r.rank} (${r.c}x)`).join(", ") : ""
);

// --- Source nodes ---
console.log("\n== Source Nodes ==");
const contextNodes = db.prepare(`
  SELECT c.id, COUNT(sn.id) as nodes FROM contexts c
  LEFT JOIN source_nodes sn ON sn.context_id = c.id
  GROUP BY c.id
`).all();

for (const cn of contextNodes) {
  check(`${cn.id}: source nodes (${cn.nodes})`, cn.nodes >= 3, `Only ${cn.nodes}`);
}

// --- Market context ---
console.log("\n== Market Context ==");
const marketCtx = db.prepare("SELECT id FROM contexts WHERE id = 'market-signals'").get();
check(`market-signals context exists`, !!marketCtx);

if (marketCtx) {
  const marketSignals = db.prepare("SELECT COUNT(*) as c FROM signals WHERE context_id = 'market-signals'").get().c;
  const marketEvidence = db.prepare("SELECT COUNT(*) as c FROM evidence_packets WHERE context_id = 'market-signals'").get().c;
  check(`market-signals has signals (${marketSignals})`, marketSignals >= 4);
  check(`market-signals has evidence (${marketEvidence})`, marketEvidence > 0);

  const fixtureMeta = db.prepare("SELECT COUNT(*) as c FROM fixture_meta WHERE context_id = 'market-signals'").get().c;
  check(`market-signals has fixture meta`, fixtureMeta > 0);
}

// --- Pipeline runs ---
console.log("\n== Pipeline Runs ==");
const pipelineRuns = db.prepare("SELECT COUNT(*) as c FROM pipeline_runs").get().c;
const failedRuns = db.prepare("SELECT COUNT(*) as c FROM pipeline_runs WHERE status = 'failed'").get().c;
check(`Pipeline runs: ${pipelineRuns} total, ${failedRuns} failed`, failedRuns === 0, `${failedRuns} failed runs`);

// --- Summary ---
console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.log("SMOKE TEST FAILED");
  process.exit(1);
} else {
  console.log("ALL CHECKS PASSED");
}
