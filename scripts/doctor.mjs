#!/usr/bin/env node
/**
 * pnpm doctor — verify the environment is ready to run Signals.
 *
 * Checks: Node version, .env, OPENROUTER_API_KEY, database, port availability,
 *         optional Neo4j. Prints one line per check with a fix hint when red.
 */

import "../src/lib/env.mjs";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

let failures = 0;
function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg, hint) { failures++; console.log(`  ✗ ${msg}${hint ? `\n      ↳ ${hint}` : ""}`); }
function info(msg) { console.log(`  · ${msg}`); }

console.log("\n== Node ==");
const major = parseInt(process.versions.node.split(".")[0], 10);
if (major === 22) pass(`Node ${process.versions.node} (matches .nvmrc)`);
else fail(`Node ${process.versions.node} (need 22)`, "Run `nvm use` (requires nvm), or install Node 22.");

console.log("\n== Environment ==");
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  pass(".env file exists");
} else {
  fail(".env file missing", "Run `cp .env.example .env` then paste OPENROUTER_API_KEY.");
}

if (process.env.OPENROUTER_API_KEY) {
  pass(`OPENROUTER_API_KEY set (${process.env.OPENROUTER_API_KEY.slice(0, 8)}…)`);
} else {
  fail("OPENROUTER_API_KEY not set", "Paste your key into .env. Get one at https://openrouter.ai.");
}

console.log("\n== Database ==");
const dbPath = path.join(ROOT, "data/signals.db");
if (fs.existsSync(dbPath)) {
  pass(`data/signals.db exists (${(fs.statSync(dbPath).size / 1024).toFixed(0)} KB)`);
  try {
    const { getDb } = await import("../src/db/connection.mjs");
    const db = getDb();
    const ctxCount = db.prepare("SELECT COUNT(*) c FROM contexts").get().c;
    const sigCount = db.prepare("SELECT COUNT(*) c FROM signals").get().c;
    info(`${ctxCount} topics, ${sigCount} signals loaded`);
    if (ctxCount === 0) fail("No topics seeded", "Run `pnpm seed:all`.");
  } catch (e) {
    fail("Database read failed", e.message);
  }
} else {
  fail("data/signals.db missing", "Run `pnpm setup` (or `pnpm migrate && pnpm seed:all`).");
}

console.log("\n== Port ==");
const PORT = parseInt(process.env.PORT || "3000", 10);
const portFree = await new Promise(resolve => {
  const s = net.createServer();
  s.once("error", () => { s.close(); resolve(false); });
  s.once("listening", () => { s.close(); resolve(true); });
  s.listen(PORT, "127.0.0.1");
});
if (portFree) pass(`Port ${PORT} is free`);
else fail(`Port ${PORT} is in use`, `Run another port, e.g.  PORT=3737 pnpm dev`);

console.log("\n== Neo4j (optional) ==");
const neo4jUri = process.env.NEO4J_URI || "bolt://localhost:7687";
const m = /^bolt:\/\/([^:]+):(\d+)$/.exec(neo4jUri);
if (m) {
  const [, host, port] = m;
  const reachable = await new Promise(resolve => {
    const s = net.createConnection({ host, port: parseInt(port, 10) });
    s.setTimeout(800);
    s.once("connect", () => { s.end(); resolve(true); });
    s.once("error",   () => { resolve(false); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
  });
  if (reachable) pass(`Neo4j reachable at ${neo4jUri}`);
  else info(`Neo4j not running at ${neo4jUri} — graph-based scoring will fall back to SQLite. Fine for the happy path.`);
} else {
  info("NEO4J_URI not parseable — skipping check.");
}

console.log(`\n${"=".repeat(40)}`);
if (failures === 0) {
  console.log("All checks passed. Run `pnpm demo` or `pnpm dev`.");
} else {
  console.log(`${failures} check${failures === 1 ? "" : "s"} failed. Fix the items above, then re-run \`pnpm doctor\`.`);
  process.exit(1);
}
