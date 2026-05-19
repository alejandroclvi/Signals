#!/usr/bin/env node
/**
 * Multi-producer ingestion — fans a context's queries out to selected producers
 * (hackernews, polymarket) and writes evidence packets directly to SQLite.
 *
 * Idempotent via source_item_id. Does NOT run the regex/LLM classify stage —
 * that's a separate step (`pnpm reclassify`). Polymarket evidence ships with
 * pre-set evidence_state from market dynamics.
 *
 * Usage:
 *   node scripts/ingest-multi.mjs <context-id> --producer hackernews
 *   node scripts/ingest-multi.mjs <context-id> --producer hackernews,polymarket
 *   node scripts/ingest-multi.mjs <context-id> --producer polymarket --slugs slug1,slug2
 */

import "../src/lib/env.mjs";
import { getDb } from "../src/db/connection.mjs";
import { getProducer, listProducers } from "../src/pipeline/producers/registry.mjs";
import { ensureNodeForProducer } from "../src/pipeline/producers/node-info.mjs";

function safeJson(v, f) {
  if (typeof v === "object" && v !== null) return v;
  try { return JSON.parse(v); } catch { return f; }
}

function parseArgs(argv) {
  const args = { producer: [], slugs: [], tags: null };
  args.contextId = argv[2];
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--producer")  args.producer = argv[++i].split(",");
    else if (a === "--slugs") args.slugs = argv[++i].split(",");
    else if (a === "--tags")  args.tags  = argv[++i].split(",").map(s => Number(s.trim())).filter(Boolean);
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (a === "--after") args.afterDate = argv[++i];
    else if (a === "--before") args.beforeDate = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.contextId || !args.producer.length) {
    console.error("Usage: node scripts/ingest-multi.mjs <context-id> --producer <ids>");
    console.error("Available producers:", listProducers().map(p => `${p.id}(${p.layer}/${p.kind})`).join(", "));
    process.exit(1);
  }

  const db = getDb();
  const ctx = db.prepare("SELECT * FROM contexts WHERE id = ?").get(args.contextId);
  if (!ctx) throw new Error(`Context not found: ${args.contextId}`);

  const queries = safeJson(ctx.queries, []);
  if (!queries.length && !args.slugs.length) {
    throw new Error("Context has no queries and no --slugs provided");
  }

  console.log(`Context: ${ctx.label} (${queries.length} queries)`);
  console.log(`Producers: ${args.producer.join(", ")}`);
  console.log();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO evidence_packets
      (id, context_id, source_id, source_layer, source_item_id, url, title, body,
       author_ref, community, observed_at, published_at, metrics, topics, raw_ref,
       content_hash, intent, awareness_level, evidence_weight, quality_score,
       sentiment, evidence_state, source_kind)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const totals = {};
  for (const producerId of args.producer) {
    const producer = getProducer(producerId);
    process.stdout.write(`▸ ${producerId}: fetching… `);

    const t0 = Date.now();
    const packets = await producer.search({
      contextId: args.contextId,
      queries,
      marketSlugs: args.slugs,
      tagIds: args.tags,
      limit: args.limit,
      afterDate: args.afterDate,
      beforeDate: args.beforeDate,
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const p of packets) {
        const r = insert.run(
          p.id, p.context_id, p.source_id, p.source_layer, p.source_item_id,
          p.url, p.title, p.body, p.author_ref, p.community, p.observed_at,
          p.published_at, p.metrics, p.topics, p.raw_ref, p.content_hash,
          p.intent, p.awareness_level, p.evidence_weight, p.quality_score,
          p.sentiment, p.evidence_state, p.source_kind
        );
        if (r.changes > 0) inserted++;
      }
      // Register the producer as a source_node for this context so the
      // dashboard's layer ladder reflects the new coverage. Only register
      // when we actually wrote evidence — otherwise the node would appear
      // empty in the UI.
      if (inserted > 0) {
        ensureNodeForProducer(db, producerId, args.contextId, { packets: inserted });
      }
    });
    tx();
    console.log(`${packets.length} packets fetched, ${inserted} new (${elapsed}s)`);
    totals[producerId] = { fetched: packets.length, inserted };
  }

  console.log();
  console.log("Done. Next:");
  console.log("  pnpm graph:sync " + args.contextId);
  if (Object.keys(totals).some(k => k !== "polymarket")) {
    console.log("  pnpm reclassify " + args.contextId + "  # for HN evidence_state");
  }
}

main().catch(err => { console.error(err); process.exit(1); });
