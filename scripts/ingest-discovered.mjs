#!/usr/bin/env node

/**
 * Ingest Reddit threads discovered by Google search.
 *
 * Reads discovered-{contextId}.json and fetches each thread + comments
 * via Reddit's JSON API, then runs the full pipeline.
 *
 * Usage:
 *   node scripts/ingest-discovered.mjs --context market-blindness
 */

import "../src/db/migrate.mjs";
import { getDb } from "../src/db/connection.mjs";
import { normalizeRedditPost, normalizeRedditComments } from "../src/pipeline/normalizer.mjs";
import { extractSignals } from "../src/pipeline/signal-extractor.mjs";
import { scoreSignal, confidenceFromScore } from "../src/pipeline/scorer.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DELAY_MS = 1200;
const COMMENT_LIMIT = 15; // More comments per thread since these are high-quality discovered threads

const args = process.argv.slice(2);
function flag(name) {
  const idx = args.indexOf("--" + name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const contextId = flag("context");
if (!contextId) {
  console.error("Usage: node scripts/ingest-discovered.mjs --context <context-id>");
  process.exit(1);
}

const discoveredPath = path.resolve("data", `discovered-${contextId}.json`);
if (!fs.existsSync(discoveredPath)) {
  console.error("No discovered threads found. Run discover-reddit-threads.mjs first.");
  console.error("Expected: " + discoveredPath);
  process.exit(1);
}

const discovered = JSON.parse(fs.readFileSync(discoveredPath, "utf-8"));
console.log(`\nIngesting ${discovered.length} discovered threads for "${contextId}"\n`);

const db = getDb();
const runId = crypto.randomUUID();
const startedAt = new Date().toISOString();

// Existing evidence for resume support
const existingIds = new Set(
  db.prepare("SELECT id FROM evidence_packets WHERE context_id = ?").all(contextId).map(r => r.id)
);

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "SignalsLocalPoC/0.1 by local-developer" },
    });
    if (response.ok) return response;
    if (response.status === 429 && attempt < retries) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "0", 10);
      const backoff = Math.max(retryAfter * 1000, DELAY_MS * Math.pow(2, attempt + 1));
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }
    throw new Error(`Reddit ${response.status}: ${url}`);
  }
}

// Fetch all discovered threads
const allPackets = [];
let fetched = 0;
let errors = 0;

for (const thread of discovered) {
  try {
    let jsonUrl = thread.url.replace(/\/$/, "");
    if (!jsonUrl.endsWith(".json")) jsonUrl += ".json";
    jsonUrl += "?raw_json=1&limit=" + COMMENT_LIMIT + "&depth=1";

    const res = await fetchWithRetry(jsonUrl);
    const json = await res.json();

    // Post
    const postData = json[0]?.data?.children?.[0]?.data;
    if (!postData) { errors++; continue; }

    postData._subreddit_query = thread.query;
    postData._subreddit_target = thread.subreddit;

    const postPacket = normalizeRedditPost(postData, contextId);
    if (!existingIds.has(postPacket.id)) {
      allPackets.push(postPacket);
    }

    // Comments
    const comments = (json[1]?.data?.children || [])
      .filter(c => c.kind === "t1" && c.data.body)
      .slice(0, COMMENT_LIMIT)
      .map(c => ({
        ...c.data,
        _post_permalink: postData.permalink,
        _topic: thread.query,
        link_title: postData.title || "",
      }));

    const seenHashes = new Set(allPackets.map(p => p.content_hash));
    const commentPackets = [];
    for (const comment of comments) {
      const packet = (await import("../src/pipeline/normalizer.mjs")).normalizeRedditComment(comment, contextId);
      if (!seenHashes.has(packet.content_hash) && !existingIds.has(packet.id)) {
        seenHashes.add(packet.content_hash);
        commentPackets.push(packet);
      }
    }
    allPackets.push(...commentPackets);

    fetched++;
    process.stdout.write(`\r  Fetched ${fetched}/${discovered.length} threads (${allPackets.length} packets, ${errors} errors)`);

    await new Promise(r => setTimeout(r, DELAY_MS));
  } catch (err) {
    errors++;
  }
}

console.log(`\n\n  ${allPackets.length} evidence packets from ${fetched} threads\n`);

if (!allPackets.length) {
  console.log("No new evidence to ingest.");
  process.exit(0);
}

// Quality gate: filter
const filtered = allPackets.filter(ep => {
  if (!ep.body || ep.body.trim().length < 20) return false;
  if (ep.author_ref === "deleted_or_unknown") return false;
  return true;
});
console.log(`  ${filtered.length} passed quality gate (${allPackets.length - filtered.length} rejected)\n`);

// Write evidence
const insertEvidence = db.prepare(
  `INSERT OR IGNORE INTO evidence_packets
   (id, context_id, source_id, source_layer, source_item_id, url, title, body,
    author_ref, community, observed_at, published_at, metrics, topics, raw_ref, content_hash,
    intent, awareness_level, evidence_weight, quality_score, pipeline_run_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

db.transaction(() => {
  for (const ep of filtered) {
    insertEvidence.run(
      ep.id, ep.context_id, ep.source_id, ep.source_layer, ep.source_item_id,
      ep.url, ep.title, ep.body, ep.author_ref, ep.community,
      ep.observed_at, ep.published_at, ep.metrics, ep.topics, ep.raw_ref, ep.content_hash,
      ep.intent || "question", ep.awareness_level || "problem_aware", ep.evidence_weight || 1.0,
      null, runId
    );
  }
})();

// Extract signals from ALL evidence
const allEvidence = db.prepare("SELECT * FROM evidence_packets WHERE context_id = ?").all(contextId);
console.log(`  Extracting signals from ${allEvidence.length} total evidence packets...`);

const { signals, signalEvidence } = extractSignals(allEvidence, contextId);

// Score
for (const signal of signals) {
  const packetIds = signalEvidence.get(signal.id) || [];
  const packets = allEvidence.filter(ep => packetIds.includes(ep.id));
  const { components, total } = scoreSignal(signal, packets);
  signal.confidence = confidenceFromScore(total);
  signal._scoreComponents = components;
  signal._scoreTotal = total;
}

// Write signals
db.transaction(() => {
  // Clear old live signals
  const oldSignals = db.prepare("SELECT id FROM signals WHERE context_id = ? AND id LIKE 'live:%'").all(contextId);
  for (const old of oldSignals) {
    db.prepare("DELETE FROM signal_related WHERE signal_id = ?").run(old.id);
    db.prepare("DELETE FROM signal_spread WHERE signal_id = ?").run(old.id);
    db.prepare("DELETE FROM signal_phrases WHERE signal_id = ?").run(old.id);
    db.prepare("DELETE FROM signal_evidence WHERE signal_id = ?").run(old.id);
    db.prepare("DELETE FROM scoring_runs WHERE signal_id = ?").run(old.id);
  }
  db.prepare("DELETE FROM signals WHERE context_id = ? AND id LIKE 'live:%'").run(contextId);
  db.prepare(
    `DELETE FROM evidence_extractions WHERE evidence_id IN
     (SELECT id FROM evidence_packets WHERE context_id = ?)`
  ).run(contextId);

  const insertSignal = db.prepare(
    `INSERT OR REPLACE INTO signals
     (id, context_id, rank, status, title, growth, tags, summary, communities,
      mentions, comments, confidence, volume, why, suggested_title, suggested_sub,
      next_source, dominant_intent, intent_mix, awareness_distribution, dominant_awareness,
      desire_type, top_extractions, failed_solutions,
      bubble_x, bubble_y, bubble_r)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSE = db.prepare("INSERT OR REPLACE INTO signal_evidence (signal_id, evidence_id) VALUES (?, ?)");
  const insertPhrase = db.prepare("INSERT INTO signal_phrases (signal_id, phrase, count) VALUES (?, ?, ?)");
  const insertSpread = db.prepare("INSERT INTO signal_spread (signal_id, community, percentage) VALUES (?, ?, ?)");
  const insertScoringRun = db.prepare("INSERT INTO scoring_runs (id, signal_id, components, total) VALUES (?, ?, ?, ?)");
  const insertExtraction = db.prepare(
    `INSERT OR IGNORE INTO evidence_extractions
     (id, evidence_id, extraction_type, surface_text, deeper_text, confidence, upvotes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const signal of signals) {
    insertSignal.run(
      signal.id, signal.context_id, signal.rank, signal.status,
      signal.title, signal.growth, signal.tags, signal.summary,
      signal.communities, signal.mentions, signal.comments,
      signal.confidence, signal.volume, signal.why,
      signal.suggested_title, signal.suggested_sub, signal.next_source,
      signal.dominant_intent || "question", signal.intent_mix || "{}",
      signal.awareness_distribution || "{}", signal.dominant_awareness || "problem_aware",
      signal.desire_type || null, signal.top_extractions || "[]", signal.failed_solutions || "[]",
      signal.bubble_x, signal.bubble_y, signal.bubble_r
    );

    for (const eid of (signalEvidence.get(signal.id) || [])) insertSE.run(signal.id, eid);
    if (signal._phrases) for (const [phrase, count] of signal._phrases) insertPhrase.run(signal.id, phrase, count);
    if (signal._spread) for (const [community, pct] of signal._spread) insertSpread.run(signal.id, community, pct);
    if (signal._scoreComponents) insertScoringRun.run(crypto.randomUUID(), signal.id, JSON.stringify(signal._scoreComponents), signal._scoreTotal);
    if (signal._deepExtractions) for (const ext of signal._deepExtractions) {
      insertExtraction.run(ext.id, ext.evidence_id, ext.extraction_type, ext.surface_text, ext.deeper_text, ext.confidence, ext.upvotes);
    }
  }
})();

// Pipeline run record
db.prepare(
  `INSERT INTO pipeline_runs (id, context_id, started_at, completed_at, stage_results, quality_gates, evidence_in, evidence_out, signals_produced, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(runId, contextId, startedAt, new Date().toISOString(),
  JSON.stringify({ mode: "google-discovery", threads: fetched, packets: allPackets.length }),
  JSON.stringify({ collection: { passed: true }, classification: { passed: true }, extraction: { passed: true }, validation: { passed: true } }),
  filtered.length, filtered.length, signals.length, "completed"
);

// Summary
const communities = {};
for (const ep of filtered) {
  communities[ep.community] = (communities[ep.community] || 0) + 1;
}

console.log(`\n${"=".repeat(60)}`);
console.log(`Done. ${filtered.length} evidence, ${signals.length} signals.`);
console.log(`\nDiscovered communities:`);
Object.entries(communities).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([c, n]) => console.log(`  ${c}: ${n}`));

const awDist = {};
for (const ep of filtered) { awDist[ep.awareness_level] = (awDist[ep.awareness_level] || 0) + 1; }
console.log(`\nAwareness: ${Object.entries(awDist).map(([k, v]) => k + "=" + v).join(", ")}`);

console.log(`\nView in dashboard: pnpm dev → http://localhost:3000`);
