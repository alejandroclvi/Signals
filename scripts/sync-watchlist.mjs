#!/usr/bin/env node
/**
 * pnpm sync-watchlist [--context <id>]
 *
 * Derives the `watched_sources` registry from `evidence_packets`. A "watched
 * source" is a productive surface — a subreddit, host, repo, market, ticker,
 * or HN section — that has actually produced evidence for a context. Once
 * registered, periodic refresh can re-hit these surfaces cheaply instead of
 * rediscovering hubs from scratch.
 *
 * Idempotent — re-running keeps existing pinned/muted state and only refreshes
 * counts and last_seen_at.
 *
 * Handle derivation per producer:
 *   reddit       → community ("r/ClaudeCode")
 *   hackernews   → community ("hn:show")
 *   google       → URL hostname ("openrouter.ai")
 *   github       → "<owner>/<repo>" from URL
 *   polymarket   → community ("polymarket:anthropic")
 *   hn-hiring    → community ("hn:whoishiring")
 *   yfinance     → community ("yfinance:NVDA")
 *   stocktwits   → community ("stocktwits:$NVDA")
 *   anthropic    → community ("anthropic:claude-code")
 *   any other    → community (fallback)
 */

import { getDb } from "../src/db/connection.mjs";
import "../src/db/migrate.mjs";
import crypto from "node:crypto";

const db = getDb();
const args = process.argv.slice(2);
const ctxFilter = (() => { const i = args.indexOf("--context"); return i >= 0 ? args[i + 1] : null; })();

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

function githubRepoFromUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("github.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch { return null; }
}

function handleAndKindFor(producer, packet) {
  const community = packet.community || "";
  switch (producer) {
    case "reddit":
      return { handle: community || "(unknown)", kind: "subreddit", url: `https://www.reddit.com/${community.replace(/^r\//, "r/")}` };
    case "hackernews":
      return { handle: community || "hn:newest", kind: "hn-section", url: "https://news.ycombinator.com/" };
    case "hn-hiring":
      return { handle: community || "hn:whoishiring", kind: "hn-hiring", url: "https://news.ycombinator.com/submitted?id=whoishiring" };
    case "google": {
      const host = hostFromUrl(packet.url);
      return { handle: host || community || "(unknown)", kind: "website", url: host ? `https://${host}` : null };
    }
    case "github": {
      const repo = githubRepoFromUrl(packet.url);
      return { handle: repo || community || "(unknown)", kind: "repo", url: repo ? `https://github.com/${repo}` : null };
    }
    case "polymarket":
      return { handle: community || "polymarket", kind: "market-tag", url: "https://polymarket.com/" };
    case "yfinance":
      return { handle: community || "yfinance", kind: "ticker", url: packet.url };
    case "stocktwits":
      return { handle: community || "stocktwits", kind: "ticker", url: packet.url };
    case "reddit-finance":
      return { handle: community || "reddit-finance", kind: "subreddit", url: packet.url };
    case "anthropic":
      return { handle: community || "anthropic", kind: "vendor-project", url: packet.url };
    default:
      return { handle: community || producer, kind: "other", url: packet.url };
  }
}

function watchedId(contextId, producer, handle) {
  return `${producer}:${contextId}:${crypto.createHash("sha1").update(handle).digest("hex").slice(0, 10)}`;
}

// Aggregate signals + threads per (context, producer, handle).
const ctxClause = ctxFilter ? "AND ep.context_id = ?" : "";
const params = ctxFilter ? [ctxFilter] : [];

// Sample one URL per (context, source_id, community) so the handle derivation
// (which sometimes needs the URL — e.g. google host, github repo) has a
// concrete URL to read.
const sampleByCommunity = db.prepare(`
  SELECT ep.context_id, ep.source_id, ep.community, MAX(ep.url) AS url
  FROM evidence_packets ep
  WHERE ep.context_id IS NOT NULL ${ctxClause}
  GROUP BY ep.context_id, ep.source_id, ep.community
`).all(...params);

// Per (context, producer, handle) → counts + last seen.
const counts = new Map();

for (const sample of sampleByCommunity) {
  const { handle, kind, url } = handleAndKindFor(sample.source_id, { community: sample.community, url: sample.url });
  if (!handle) continue;
  const key = `${sample.context_id}::${sample.source_id}::${handle}`;
  if (!counts.has(key)) {
    counts.set(key, {
      context_id: sample.context_id,
      producer: sample.source_id,
      handle,
      kind,
      url,
      evidence_count: 0,
      signal_count: 0,
      thread_count: 0,
      first_seen_at: null,
      last_seen_at: null,
    });
  }
}

// Now fill the counts. Use a single pass over the whole context's evidence
// rather than per-handle queries (handles are derived again to bucket each
// row).
const allPackets = db.prepare(`
  SELECT ep.id, ep.context_id, ep.source_id, ep.community, ep.url, ep.published_at, ep.thread_id
  FROM evidence_packets ep
  WHERE ep.context_id IS NOT NULL ${ctxClause}
`).all(...params);

const handleByPacket = new Map();
for (const p of allPackets) {
  const { handle } = handleAndKindFor(p.source_id, p);
  if (!handle) continue;
  const key = `${p.context_id}::${p.source_id}::${handle}`;
  const bucket = counts.get(key);
  if (!bucket) continue;
  bucket.evidence_count++;
  if (p.published_at) {
    if (!bucket.first_seen_at || p.published_at < bucket.first_seen_at) bucket.first_seen_at = p.published_at;
    if (!bucket.last_seen_at || p.published_at > bucket.last_seen_at) bucket.last_seen_at = p.published_at;
  }
  handleByPacket.set(p.id, key);
}

// signal_count per (context, producer, handle) — count distinct signals whose
// linked evidence falls into this handle bucket.
const signalLinks = db.prepare(`
  SELECT se.signal_id, se.evidence_id
  FROM signal_evidence se
  JOIN evidence_packets ep ON ep.id = se.evidence_id
  WHERE ep.context_id IS NOT NULL ${ctxClause}
`).all(...params);

const signalsByKey = new Map();
for (const link of signalLinks) {
  const key = handleByPacket.get(link.evidence_id);
  if (!key) continue;
  if (!signalsByKey.has(key)) signalsByKey.set(key, new Set());
  signalsByKey.get(key).add(link.signal_id);
}
for (const [key, signalSet] of signalsByKey) {
  const bucket = counts.get(key);
  if (bucket) bucket.signal_count = signalSet.size;
}

// thread_count
const threadsByKey = new Map();
for (const p of allPackets) {
  if (!p.thread_id) continue;
  const key = handleByPacket.get(p.id);
  if (!key) continue;
  if (!threadsByKey.has(key)) threadsByKey.set(key, new Set());
  threadsByKey.get(key).add(p.thread_id);
}
for (const [key, set] of threadsByKey) {
  const bucket = counts.get(key);
  if (bucket) bucket.thread_count = set.size;
}

// Upsert: preserve pinned/muted/added_at on existing rows; update counts +
// last_seen. New rows get added_by='auto'.
const upsert = db.prepare(`
  INSERT INTO watched_sources
    (id, context_id, producer, kind, handle, label, url,
     evidence_count, signal_count, thread_count,
     first_seen_at, last_seen_at, pinned, muted, added_at, added_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'), 'auto')
  ON CONFLICT(id) DO UPDATE SET
    evidence_count = excluded.evidence_count,
    signal_count   = excluded.signal_count,
    thread_count   = excluded.thread_count,
    first_seen_at  = COALESCE(watched_sources.first_seen_at, excluded.first_seen_at),
    last_seen_at   = excluded.last_seen_at,
    url            = COALESCE(watched_sources.url, excluded.url),
    label          = COALESCE(watched_sources.label, excluded.label)
`);

let inserted = 0;
let updated = 0;
const tx = db.transaction(() => {
  for (const bucket of counts.values()) {
    const id = watchedId(bucket.context_id, bucket.producer, bucket.handle);
    const existing = db.prepare("SELECT id FROM watched_sources WHERE id = ?").get(id);
    upsert.run(
      id,
      bucket.context_id,
      bucket.producer,
      bucket.kind,
      bucket.handle,
      bucket.handle,
      bucket.url,
      bucket.evidence_count,
      bucket.signal_count,
      bucket.thread_count,
      bucket.first_seen_at,
      bucket.last_seen_at
    );
    if (existing) updated++;
    else inserted++;
  }
});
tx();

console.log(`watched_sources sync complete.`);
console.log(`  inserted: ${inserted}`);
console.log(`  updated:  ${updated}`);

// Diagnostic: top productive surfaces per context
console.log(`\nTop watched sources by evidence count:`);
const topRows = db.prepare(`
  SELECT context_id, producer, handle, kind, evidence_count, signal_count, last_seen_at
  FROM watched_sources
  WHERE muted = 0
  ORDER BY context_id, evidence_count DESC
`).all();

let lastCtx = null;
for (const r of topRows) {
  if (r.context_id !== lastCtx) {
    console.log(`\n  ${r.context_id}:`);
    lastCtx = r.context_id;
  }
  console.log(`    ${r.producer.padEnd(14)} ${r.kind.padEnd(14)} ${r.handle.padEnd(28)} ev=${r.evidence_count.toString().padStart(4)}  sigs=${r.signal_count}`);
}
