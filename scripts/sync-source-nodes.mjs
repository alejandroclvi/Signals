#!/usr/bin/env node
/**
 * pnpm sync-source-nodes
 *
 * Registers a `source_nodes` row for every (context_id, source_id) pair that
 * already has evidence in `evidence_packets`. Idempotent.
 *
 * Why this exists:
 * - The dashboard's "Source coverage" layer ladder reads from `source_nodes`,
 *   not from `evidence_packets`. If a producer wrote evidence without a
 *   matching node, the layer shows MISSING even though data is there.
 * - Older seed scripts only register a default subset (reddit, google, hn,
 *   github, primary). This script catches everything else and brings the
 *   table up to date.
 * - `scripts/ingest-multi.mjs` now auto-registers a node when it writes
 *   evidence, so this sync is only needed for retroactive cleanup after a
 *   restore (or one-time after this fix lands).
 */

import { getDb } from "../src/db/connection.mjs";
import "../src/db/migrate.mjs";
import { ensureNodeForProducer, nodeInfoFor } from "../src/pipeline/producers/node-info.mjs";

const db = getDb();

const pairs = db.prepare(`
  SELECT context_id, source_id, COUNT(*) packets
  FROM evidence_packets
  WHERE context_id IS NOT NULL AND source_id IS NOT NULL
  GROUP BY context_id, source_id
`).all();

let inserted = 0;
let updated = 0;
let skipped = 0;
const unknownProducers = new Set();

const tx = db.transaction(() => {
  for (const p of pairs) {
    if (!nodeInfoFor(p.source_id)) {
      unknownProducers.add(p.source_id);
      skipped++;
      continue;
    }
    const result = ensureNodeForProducer(db, p.source_id, p.context_id, { packets: p.packets });
    if (result === "inserted") inserted++;
    else if (result === "updated") updated++;
  }
});
tx();

console.log(`source_nodes sync complete.`);
console.log(`  inserted: ${inserted}`);
console.log(`  updated:  ${updated}`);
console.log(`  skipped:  ${skipped}${unknownProducers.size ? ` (unknown producers: ${[...unknownProducers].join(", ")})` : ""}`);

// Diagnostic: show per-context layer coverage as the ladder will now render it.
console.log("\nLayer coverage per context (post-sync):");
const layerByCtx = db.prepare(`
  SELECT context_id, COUNT(DISTINCT json_extract(layers, '$[0]')) layers
  FROM source_nodes WHERE state = 'enabled'
  GROUP BY context_id
`).all();
for (const r of layerByCtx) console.log(`  ${r.context_id.padEnd(40)}  ${r.layers}/7 layers covered`);
