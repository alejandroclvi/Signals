#!/usr/bin/env node
/**
 * pnpm refresh <context-id>
 *
 * One-command refresh for a topic. Wraps:
 *   1. weekly-cadence flow (lifecycle → cast-net → linker → article)
 *   2. unify-signals flow (cross-source thesis)
 *
 * Both flows are no-ops on contexts that don't need them, so this is safe
 * to run repeatedly. Triggers an SSE reload at the end so the dashboard
 * picks up the new data without a manual refresh.
 */

import "../src/lib/env.mjs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ctx = process.argv[2];

if (!ctx) {
  console.error("Usage: pnpm refresh <context-id>");
  console.error("");
  console.error("Tip: see available contexts with:");
  console.error("  curl -s http://localhost:3000/api/contexts | grep -o '\"id\":\"[^\"]*\"'");
  process.exit(1);
}

function runFlow(flow, args = []) {
  console.log(`\n▶ ${flow}`);
  const r = spawnSync(
    "pnpm",
    ["flow", "run", flow, "--context", ctx, ...args],
    { cwd: ROOT, stdio: "inherit" }
  );
  if (r.status !== 0) {
    console.error(`✗ ${flow} failed (exit ${r.status})`);
    return false;
  }
  return true;
}

console.log(`\nRefreshing topic: ${ctx}\n`);

let ok = true;

// 1. weekly cadence (ingest, lifecycle, cast-net, link, article)
ok = runFlow("weekly-cadence") && ok;

// 2. unified cross-source theses
ok = runFlow("unify-signals") && ok;

// 3. Refresh the productive-surfaces registry — new evidence may have come
//    from new hubs (subreddits, repos, hostnames). Sync keeps the watchlist
//    accurate for the next refresh and for the dashboard /watchlist page.
console.log("\n▶ sync-watchlist (refreshing productive surfaces cache)");
const sw = spawnSync("node", ["scripts/sync-watchlist.mjs", "--context", ctx], { cwd: ROOT, stdio: "inherit" });
if (sw.status !== 0) console.error("  ⚠ sync-watchlist exited", sw.status);

// 4. Trigger dashboard reload if the server is running
try {
  const PORT = process.env.PORT || "3000";
  await fetch(`http://localhost:${PORT}/api/reload`, { method: "POST" });
  console.log("\n↻ Dashboard reload triggered.");
} catch {
  // Server not running — fine
}

console.log(`\n${ok ? "✓" : "⚠"} Refresh ${ok ? "complete" : "completed with errors"} for ${ctx}.`);
console.log(`  Brief:    output/unified-${ctx}-<date>.md`);
console.log(`  Watch:    http://localhost:${process.env.PORT || "3000"}/watchlist?context=${ctx}`);
console.log(`  Dashboard: http://localhost:${process.env.PORT || "3000"}/?context=${ctx}`);

process.exit(ok ? 0 : 1);
