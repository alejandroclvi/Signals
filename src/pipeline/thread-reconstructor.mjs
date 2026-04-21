/**
 * Thread Reconstructor — groups flat evidence packets into Reddit threads.
 *
 * Strategy:
 *   - Posts have source_item_id like "t3_abc123"
 *   - Comments have URLs containing /comments/{post_id}/
 *   - Group post + all comments sharing that post ID
 *   - Compute quality metrics per thread
 *   - Assign quality tiers for LLM budget filtering
 */

import { getDb } from "../db/connection.mjs";
import { communityRelevance } from "./community-relevance.mjs";
import crypto from "node:crypto";

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Extract the Reddit post ID from a URL.
 * URLs look like: https://www.reddit.com/r/sub/comments/POST_ID/title/...
 */
function extractPostIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/comments\/([a-z0-9]+)\//i);
  return match ? match[1] : null;
}

/**
 * Reconstruct threads from flat evidence packets for a given context.
 * Returns thread objects without storing them.
 */
export function reconstructThreads(contextId) {
  const db = getDb();

  const packets = db.prepare(
    `SELECT id, source_item_id, url, title, body, community, evidence_weight, metrics, published_at
     FROM evidence_packets WHERE context_id = ?`
  ).all(contextId);

  if (packets.length === 0) return [];

  // Index posts by their Reddit ID
  const posts = new Map(); // post_reddit_id → packet
  const commentsByPost = new Map(); // post_reddit_id → [comment packets]

  for (const p of packets) {
    const sid = p.source_item_id || "";

    if (sid.startsWith("t3_")) {
      const redditId = sid.replace("t3_", "");
      posts.set(redditId, p);
      if (!commentsByPost.has(redditId)) commentsByPost.set(redditId, []);
    } else if (sid.startsWith("t1_")) {
      const postId = extractPostIdFromUrl(p.url);
      if (postId) {
        if (!commentsByPost.has(postId)) commentsByPost.set(postId, []);
        commentsByPost.get(postId).push(p);
      }
    }
  }

  // Build thread objects
  const threads = [];

  for (const [redditId, post] of posts) {
    const comments = commentsByPost.get(redditId) || [];
    const allPackets = [post, ...comments];

    // Sort comments by upvotes descending
    comments.sort((a, b) => {
      const aScore = safeParseJson(a.metrics, {}).score || 0;
      const bScore = safeParseJson(b.metrics, {}).score || 0;
      return bScore - aScore;
    });

    const weightedEvidence = allPackets.reduce((sum, p) => sum + (p.evidence_weight || 1.0), 0);
    const totalScore = allPackets.reduce((sum, p) => {
      const m = safeParseJson(p.metrics, {});
      return sum + (m.score || 0);
    }, 0);

    // Community relevance multiplier — business-relevant threads rank higher
    const relevance = communityRelevance(post.community);
    const relevanceWeighted = weightedEvidence * relevance;

    let qualityTier = "low";
    if (relevanceWeighted >= 4.0) qualityTier = "high";
    else if (relevanceWeighted >= 2.0) qualityTier = "medium";
    // Noise communities (relevance <= 0.1) will almost always be "low"
    // even with high engagement — this is intentional

    threads.push({
      id: `thread:${redditId}`,
      contextId,
      postId: post.id,
      redditId,
      community: post.community,
      title: post.title,
      url: post.url,
      commentCount: comments.length,
      totalScore,
      weightedEvidence,
      relevance,
      relevanceWeighted,
      qualityTier,
      post,
      comments,
      allPackets,
    });
  }

  // Sort by relevance-weighted evidence descending
  // This puts r/SaaS (1.0x) ahead of r/AmItheAsshole (0.1x) even with fewer upvotes
  threads.sort((a, b) => b.relevanceWeighted - a.relevanceWeighted);
  return threads;
}

/**
 * Filter threads that qualify for LLM analysis.
 * Uses relevance-weighted score so noise communities are excluded.
 */
export function qualifyThreads(threads, options = {}) {
  const { minWeightedEvidence = 2.0, minComments = 1, minRelevance = 0.2 } = options;
  return threads.filter(t =>
    t.relevanceWeighted >= minWeightedEvidence &&
    t.commentCount >= minComments &&
    t.relevance >= minRelevance
  );
}

/**
 * Store reconstructed threads in the database.
 * Updates evidence_packets with thread_id.
 */
export function storeThreads(threads) {
  const db = getDb();

  const upsertThread = db.prepare(`
    INSERT INTO threads (id, context_id, post_id, community, title, url, comment_count, total_score, weighted_evidence, quality_tier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      comment_count = excluded.comment_count,
      total_score = excluded.total_score,
      weighted_evidence = excluded.weighted_evidence,
      quality_tier = excluded.quality_tier
  `);

  const upsertPacket = db.prepare(`
    INSERT OR IGNORE INTO thread_packets (thread_id, evidence_id, position)
    VALUES (?, ?, ?)
  `);

  const updateEvidenceThread = db.prepare(
    `UPDATE evidence_packets SET thread_id = ? WHERE id = ?`
  );

  const store = db.transaction(() => {
    for (const t of threads) {
      upsertThread.run(
        t.id, t.contextId, t.postId, t.community, t.title, t.url,
        t.commentCount, t.totalScore, t.weightedEvidence, t.qualityTier
      );

      // Post at position 0, comments at 1+
      upsertPacket.run(t.id, t.post.id, 0);
      updateEvidenceThread.run(t.id, t.post.id);

      for (let i = 0; i < t.comments.length; i++) {
        upsertPacket.run(t.id, t.comments[i].id, i + 1);
        updateEvidenceThread.run(t.id, t.comments[i].id);
      }
    }
  });

  store();
  return threads.length;
}
