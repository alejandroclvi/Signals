/**
 * Ingest orchestrator — runs the full pipeline:
 *   fetch → normalize → write evidence → extract signals → score → write signals
 *
 * Can be called from the API or CLI.
 */

import { getDb } from "../db/connection.mjs";
import { fetchReddit, fetchPostComments } from "./fetchers/reddit.mjs";
import { normalizeRedditPosts, normalizeRedditComments } from "./normalizer.mjs";
import { extractSignals } from "./signal-extractor.mjs";
import { scoreSignal, confidenceFromScore } from "./scorer.mjs";
import crypto from "node:crypto";

const DELAY_MS = 1200;

/**
 * Run a Reddit ingestion for a given context.
 *
 * Options:
 *   contextId - which context to ingest into
 *   subreddits - override subreddits (defaults to context config)
 *   queries - override queries (defaults to context config)
 *   limitPerQuery - max results per query (default 12)
 *   sort - Reddit sort order (default "new")
 *   onProgress - callback for progress updates
 *
 * Returns { evidenceCount, signalCount, errors }
 */
export async function ingestReddit(options) {
  const db = getDb();
  const { contextId, onProgress } = options;

  // Load context config
  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(contextId);
  if (!context) throw new Error("Context not found: " + contextId);

  const subreddits = options.subreddits || safeParseJson(context.subreddits, []);
  const queries = options.queries || safeParseJson(context.queries, []);

  if (!subreddits.length || !queries.length) {
    throw new Error("Context has no subreddits or queries configured");
  }

  // Clean subreddit names (remove r/ prefix if present)
  const cleanSubs = subreddits.map(s => s.replace(/^r\//, ""));

  const errors = [];

  // 1. Fetch
  if (onProgress) onProgress({ stage: "fetch", message: "Fetching from Reddit..." });

  const rawPosts = await fetchReddit({
    subreddits: cleanSubs,
    queries,
    limitPerQuery: options.limitPerQuery || 12,
    sort: options.sort || "new",
    onProgress: (info) => {
      if (info.error) errors.push(info.error);
      if (onProgress) onProgress({ stage: "fetch", ...info });
    },
  });

  if (!rawPosts.length) {
    return { evidenceCount: 0, signalCount: 0, errors };
  }

  // 2. Normalize
  if (onProgress) onProgress({ stage: "normalize", message: "Normalizing " + rawPosts.length + " posts..." });
  const evidencePackets = normalizeRedditPosts(rawPosts, contextId);

  // 2b. Fetch comments for high-engagement posts
  const COMMENT_THRESHOLD = 5;
  const COMMENT_LIMIT = 8;
  // Deduplicate by permalink to avoid fetching comments for the same post twice
  const seenPermalinks = new Set();
  const highEngagement = rawPosts.filter(p => {
    if ((p.num_comments || 0) < COMMENT_THRESHOLD || !p.permalink) return false;
    if (seenPermalinks.has(p.permalink)) return false;
    seenPermalinks.add(p.permalink);
    return true;
  });

  if (highEngagement.length > 0) {
    if (onProgress) onProgress({ stage: "comments", message: "Fetching comments for " + highEngagement.length + " high-engagement posts..." });

    const seenHashes = new Set(evidencePackets.map(ep => ep.content_hash));

    for (const post of highEngagement) {
      if (!post.permalink) continue;
      const comments = await fetchPostComments(post.permalink, {
        limit: COMMENT_LIMIT,
        onProgress: (info) => {
          if (info.error) errors.push(info.error);
        },
      });

      if (comments.length > 0) {
        // Tag comments with the query topic from their parent post
        for (const c of comments) {
          c._topic = post._subreddit_query || "";
          c.link_title = post.title || "";
        }
        const commentPackets = normalizeRedditComments(comments, contextId, seenHashes);
        evidencePackets.push(...commentPackets);
      }

      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    if (onProgress) onProgress({ stage: "comments", message: "Total evidence after comments: " + evidencePackets.length });
  }

  // 3. Write evidence to SQLite
  if (onProgress) onProgress({ stage: "store", message: "Storing " + evidencePackets.length + " evidence packets..." });

  const insertEvidence = db.prepare(
    `INSERT OR REPLACE INTO evidence_packets
     (id, context_id, source_id, source_layer, source_item_id, url, title, body,
      author_ref, community, observed_at, published_at, metrics, topics, raw_ref, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const writeEvidence = db.transaction(() => {
    for (const ep of evidencePackets) {
      insertEvidence.run(
        ep.id, ep.context_id, ep.source_id, ep.source_layer, ep.source_item_id,
        ep.url, ep.title, ep.body, ep.author_ref, ep.community,
        ep.observed_at, ep.published_at, ep.metrics, ep.topics, ep.raw_ref, ep.content_hash
      );
    }
  });
  writeEvidence();

  // 4. Extract signals
  if (onProgress) onProgress({ stage: "extract", message: "Extracting signals..." });

  const { signals, signalEvidence } = extractSignals(evidencePackets, contextId);

  // 5. Score signals
  if (onProgress) onProgress({ stage: "score", message: "Scoring " + signals.length + " signals..." });

  for (const signal of signals) {
    const packetIds = signalEvidence.get(signal.id) || [];
    const packets = evidencePackets.filter(ep => packetIds.includes(ep.id));
    const { components, total } = scoreSignal(signal, packets);
    signal.confidence = confidenceFromScore(total);
    signal._scoreComponents = components;
    signal._scoreTotal = total;
  }

  // 6. Write signals to SQLite
  if (onProgress) onProgress({ stage: "store", message: "Storing " + signals.length + " signals..." });

  const writeSignals = db.transaction(() => {
    // Clear previous live signals for this context
    const oldSignals = db.prepare("SELECT id FROM signals WHERE context_id = ? AND id LIKE 'live:%'").all(contextId);
    for (const old of oldSignals) {
      db.prepare("DELETE FROM signal_related WHERE signal_id = ?").run(old.id);
      db.prepare("DELETE FROM signal_spread WHERE signal_id = ?").run(old.id);
      db.prepare("DELETE FROM signal_phrases WHERE signal_id = ?").run(old.id);
      db.prepare("DELETE FROM signal_evidence WHERE signal_id = ?").run(old.id);
      db.prepare("DELETE FROM scoring_runs WHERE signal_id = ?").run(old.id);
    }
    db.prepare("DELETE FROM signals WHERE context_id = ? AND id LIKE 'live:%'").run(contextId);

    const insertSignal = db.prepare(
      `INSERT OR REPLACE INTO signals
       (id, context_id, rank, status, title, growth, tags, summary, communities,
        mentions, comments, confidence, volume, why, suggested_title, suggested_sub,
        next_source, bubble_x, bubble_y, bubble_r)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertSE = db.prepare("INSERT OR REPLACE INTO signal_evidence (signal_id, evidence_id) VALUES (?, ?)");
    const insertPhrase = db.prepare("INSERT INTO signal_phrases (signal_id, phrase, count) VALUES (?, ?, ?)");
    const insertSpread = db.prepare("INSERT INTO signal_spread (signal_id, community, percentage) VALUES (?, ?, ?)");
    const insertScoringRun = db.prepare(
      "INSERT INTO scoring_runs (id, signal_id, components, total) VALUES (?, ?, ?, ?)"
    );

    for (const signal of signals) {
      insertSignal.run(
        signal.id, signal.context_id, signal.rank, signal.status,
        signal.title, signal.growth, signal.tags, signal.summary,
        signal.communities, signal.mentions, signal.comments,
        signal.confidence, signal.volume, signal.why,
        signal.suggested_title, signal.suggested_sub, signal.next_source,
        signal.bubble_x, signal.bubble_y, signal.bubble_r
      );

      // Evidence links
      const packetIds = signalEvidence.get(signal.id) || [];
      for (const eid of packetIds) {
        insertSE.run(signal.id, eid);
      }

      // Phrases
      if (signal._phrases) {
        for (const [phrase, count] of signal._phrases) {
          insertPhrase.run(signal.id, phrase, count);
        }
      }

      // Spread
      if (signal._spread) {
        for (const [community, pct] of signal._spread) {
          insertSpread.run(signal.id, community, pct);
        }
      }

      // Scoring run
      if (signal._scoreComponents) {
        insertScoringRun.run(
          crypto.randomUUID(),
          signal.id,
          JSON.stringify(signal._scoreComponents),
          signal._scoreTotal
        );
      }
    }
  });
  writeSignals();

  if (onProgress) onProgress({ stage: "done", message: "Done. " + evidencePackets.length + " packets, " + signals.length + " signals." });

  return {
    evidenceCount: evidencePackets.length,
    signalCount: signals.length,
    errors,
  };
}

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
