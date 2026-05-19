#!/usr/bin/env node
/**
 * pnpm restore — rebuild contexts from the seed scripts and re-ingest evidence
 * from the discovered-*.json files in data/.
 *
 * Use this when:
 *   - Your DB was wiped (e.g. by an unguarded `pnpm seed:all`).
 *   - You moved machines and want to rebuild from the discovered JSONs.
 *
 * What it does (each step is opt-in via --steps):
 *   contexts  — re-runs seed-*-contexts scripts (config only, no evidence)
 *   ingest    — re-runs ingest-discovered for every discovered-*.json found
 *   theme     — regenerates theme labels (LLM; costs tokens)
 *   intel     — re-runs thread intelligence on top threads (LLM; costs tokens)
 *   unify     — re-runs unify-signals for every context (LLM; costs tokens)
 *
 * Default (no --steps): contexts + ingest only. Cheapest, deterministic.
 *
 * Usage:
 *   pnpm restore                              # contexts + ingest (no LLM)
 *   pnpm restore --steps contexts,ingest,unify
 *   pnpm restore --steps all                  # everything (expensive)
 */

import "../src/lib/env.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf("--" + name);
  return (i !== -1 && args[i + 1]) ? args[i + 1] : def;
}

const STEPS = (flag("steps", "contexts,ingest") === "all"
  ? "contexts,ingest,theme,intel,unify"
  : flag("steps", "contexts,ingest")
).split(",").map(s => s.trim());

console.log(`\nRestore plan: ${STEPS.join(", ")}\n`);

function run(label, cmd, args) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) console.error(`  ⚠ ${label} exited ${r.status}`);
  return r.status === 0;
}

// 1. Recreate context configs from the seed scripts
if (STEPS.includes("contexts")) {
  for (const seed of ["seed-claude-code-news-radar.mjs", "seed-research-contexts.mjs", "seed-discovery-contexts.mjs"]) {
    const p = path.join(ROOT, "scripts", seed);
    if (existsSync(p)) run(`Context seed: ${seed}`, "node", [`scripts/${seed}`]);
  }
}

// 2. Re-ingest evidence from each data/discovered-*.json
if (STEPS.includes("ingest")) {
  const discovered = readdirSync(path.join(ROOT, "data"))
    .filter(f => f.startsWith("discovered-") && f.endsWith(".json"))
    .map(f => f.slice("discovered-".length, -".json".length));

  if (!discovered.length) {
    console.log("\n→ No discovered-*.json files in data/. Nothing to re-ingest.");
  } else {
    console.log(`\n→ Found ${discovered.length} discovered context(s): ${discovered.join(", ")}`);
    for (const ctx of discovered) {
      run(`Re-ingest ${ctx}`, "node", ["scripts/ingest-discovered.mjs", "--context", ctx]);
    }
  }
}

// 3. LLM-driven recovery (opt-in)
if (STEPS.includes("theme")) {
  for (const ctx of restoreContexts()) run(`Theme labels: ${ctx}`, "pnpm", ["theme-labels", ctx]);
}
if (STEPS.includes("intel")) {
  for (const ctx of restoreContexts()) run(`Thread intelligence: ${ctx}`, "pnpm", ["thread-intel", "--context", ctx]);
}
if (STEPS.includes("unify")) {
  for (const ctx of restoreContexts()) run(`Unify signals: ${ctx}`, "pnpm", ["flow", "run", "unify-signals", "--context", ctx]);
}

console.log(`\n✓ Restore complete. Run \`pnpm test:smoke\` to verify.`);

function restoreContexts() {
  return readdirSync(path.join(ROOT, "data"))
    .filter(f => f.startsWith("discovered-") && f.endsWith(".json"))
    .map(f => f.slice("discovered-".length, -".json".length));
}
