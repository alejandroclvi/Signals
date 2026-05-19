#!/usr/bin/env node
/**
 * pnpm setup — one-shot first-time setup.
 *
 * Safe to re-run. Will:
 *   • install deps if node_modules is missing
 *   • run migrations (additive only — never destructive)
 *   • seed sample data ONLY if the database has no real (non-fixture) contexts
 *
 * **Why the seed-guard:** `seed:all` is destructive — it wipes signal_phrases,
 * signal_spread, signal_related across the WHOLE database and re-creates the
 * fixture contexts. Without the guard, re-running `pnpm setup` would erase
 * any real research data the user accumulated. We only re-seed if the DB
 * looks empty or fixture-only.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const cwd = ROOT;

function step(label, cmd, args) {
  process.stdout.write(`\n→ ${label}\n`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${r.status}). Aborting setup.`);
    process.exit(r.status || 1);
  }
}

// 1. node_modules
if (!existsSync(path.join(ROOT, "node_modules"))) {
  step("Installing dependencies (pnpm install)", "pnpm", ["install"]);
} else {
  console.log("→ Dependencies already installed (node_modules exists). Skipping pnpm install.");
}

// 2. database (migrations are idempotent and additive)
step("Running migrations (pnpm migrate)", "pnpm", ["migrate"]);

// 3. seed — but ONLY if the DB looks fresh. Never overwrite live data.
const FIXTURE_CTX_IDS = new Set(["founders", "law-firms", "market-signals"]);
let nonFixture = 0;
let totalEvidence = 0;
try {
  const { getDb } = await import("../src/db/connection.mjs");
  const db = getDb();
  const ctxs = db.prepare("SELECT id FROM contexts").all();
  nonFixture = ctxs.filter(c => !FIXTURE_CTX_IDS.has(c.id)).length;
  totalEvidence = db.prepare("SELECT COUNT(*) c FROM evidence_packets").get().c;
} catch {}

if (nonFixture === 0 && totalEvidence < 100) {
  step("Seeding sample data (pnpm seed:all)", "pnpm", ["seed:all"]);
} else {
  console.log(`\n→ Skipping seed: database already has ${nonFixture} non-fixture context(s) and ${totalEvidence} observations.`);
  console.log("  (Re-run \`pnpm seed:all\` manually if you really want to reset to fixture data — this is destructive.)");
}

// 4. summary
console.log(`
✓ Setup complete.

Next:
  1. cp .env.example .env       — then paste your OPENROUTER_API_KEY
  2. pnpm doctor                — verify environment
  3. pnpm demo                  — or pnpm dev — open the dashboard
`);
