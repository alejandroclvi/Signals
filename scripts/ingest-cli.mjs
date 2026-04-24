#!/usr/bin/env node

/**
 * CLI wrapper for Reddit ingestion.
 *
 * Usage:
 *   pnpm run ingest -- --context law-firms
 *   node scripts/ingest-cli.mjs --context law-firms --limit 20 --sort hot
 *   node scripts/ingest-cli.mjs --context law-firms --after 2026-04-14
 *   node scripts/ingest-cli.mjs --context law-firms --after 2026-04-14 --before 2026-04-21
 */

import { ingestReddit } from "../src/pipeline/ingest.mjs";
import "../src/db/migrate.mjs";

const args = process.argv.slice(2);

function flag(name) {
  const idx = args.indexOf("--" + name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const contextId = flag("context");
if (!contextId) {
  console.error("Usage: node scripts/ingest-cli.mjs --context <context-id> [--limit N] [--sort new|hot|top]");
  process.exit(1);
}

const limitPerQuery = parseInt(flag("limit") || "12", 10);
const sort = flag("sort") || "new";
const afterDate = flag("after");
const beforeDate = flag("before");

const timeInfo = afterDate || beforeDate
  ? `, time: ${afterDate || "∞"} → ${beforeDate || "∞"}`
  : "";
console.log(`Ingesting Reddit for context "${contextId}" (limit=${limitPerQuery}, sort=${sort}${timeInfo})...\n`);

try {
  const result = await ingestReddit({
    contextId,
    limitPerQuery,
    sort,
    afterDate,
    beforeDate,
    onProgress: (info) => {
      console.log(`  [${info.stage}] ${info.message || ""}`);
    },
  });

  console.log(`\nDone. ${result.evidenceCount} evidence packets, ${result.signalCount} signals.`);
  if (result.errors.length) {
    console.warn("Errors:", result.errors);
  }
} catch (err) {
  console.error("Ingestion failed:", err.message);
  process.exit(1);
}
