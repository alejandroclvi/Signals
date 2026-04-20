#!/usr/bin/env node

/**
 * CLI wrapper for Reddit ingestion.
 *
 * Usage:
 *   pnpm run ingest -- --context law-firms
 *   node scripts/ingest-cli.mjs --context law-firms --limit 20 --sort hot
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

console.log(`Ingesting Reddit for context "${contextId}" (limit=${limitPerQuery}, sort=${sort})...\n`);

try {
  const result = await ingestReddit({
    contextId,
    limitPerQuery,
    sort,
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
