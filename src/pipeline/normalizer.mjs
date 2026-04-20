/**
 * Normalizer — converts raw Reddit posts into evidence packets.
 * Each packet is a source-agnostic unit of evidence with provenance.
 */

import { createHash } from "node:crypto";

function stableId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function hashAuthor(author) {
  if (!author || author === "[deleted]") return "deleted_or_unknown";
  return "u/" + author;
}

function contentHash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 24);
}

/**
 * Normalize a raw Reddit post into an evidence packet.
 */
export function normalizeRedditPost(post, contextId) {
  const sourceItemId = post.name || "t3_" + post.id;
  const query = post._subreddit_query || "";
  const queryId = stableId(query);
  const observedAt = new Date().toISOString();
  const publishedAt = post.created_utc
    ? new Date(post.created_utc * 1000).toISOString()
    : observedAt;

  const body = [post.title, post.selftext].filter(Boolean).join("\n\n").slice(0, 1400);
  const permalink = post.permalink
    ? "https://www.reddit.com" + post.permalink
    : "#";

  return {
    id: "reddit:" + queryId + ":" + sourceItemId,
    context_id: contextId,
    source_id: "reddit",
    source_layer: "conversation",
    source_item_id: sourceItemId,
    url: permalink,
    title: post.title || query,
    body: body,
    author_ref: hashAuthor(post.author),
    community: post.subreddit_name_prefixed || "r/" + (post._subreddit_target || post.subreddit || "unknown"),
    observed_at: observedAt,
    published_at: publishedAt,
    metrics: JSON.stringify({
      score: post.score ?? 0,
      comments: post.num_comments ?? 0,
      upvote_ratio: post.upvote_ratio ?? null,
    }),
    topics: JSON.stringify([query]),
    raw_ref: "raw://reddit/search/" + queryId + "/" + sourceItemId,
    content_hash: contentHash(body),
  };
}

/**
 * Normalize a raw Reddit comment into an evidence packet.
 */
export function normalizeRedditComment(comment, contextId) {
  const sourceItemId = comment.name || "t1_" + comment.id;
  const observedAt = new Date().toISOString();
  const publishedAt = comment.created_utc
    ? new Date(comment.created_utc * 1000).toISOString()
    : observedAt;

  const body = (comment.body || "").slice(0, 1400);
  const postPermalink = comment._post_permalink || "";
  const commentPermalink = comment.permalink
    ? "https://www.reddit.com" + comment.permalink
    : postPermalink ? "https://www.reddit.com" + postPermalink : "#";

  const parentTopic = comment._topic || "comment";
  const queryId = stableId(parentTopic) || "general";

  return {
    id: "reddit:" + queryId + ":comment:" + sourceItemId,
    context_id: contextId,
    source_id: "reddit",
    source_layer: "conversation",
    source_item_id: sourceItemId,
    url: commentPermalink,
    title: "Comment on " + (comment.link_title || "post"),
    body: body,
    author_ref: hashAuthor(comment.author),
    community: comment.subreddit_name_prefixed || "r/" + (comment.subreddit || "unknown"),
    observed_at: observedAt,
    published_at: publishedAt,
    metrics: JSON.stringify({
      score: comment.score ?? 0,
      comments: 0,
      upvote_ratio: null,
    }),
    topics: JSON.stringify([parentTopic]),
    raw_ref: "raw://reddit/comment/" + queryId + "/" + sourceItemId,
    content_hash: contentHash(body),
  };
}

/**
 * Normalize an array of raw Reddit comments into evidence packets.
 * Deduplicates by content_hash (merges with existing seen set).
 */
export function normalizeRedditComments(comments, contextId, seen) {
  const packets = [];
  for (const comment of comments) {
    const packet = normalizeRedditComment(comment, contextId);
    if (!seen.has(packet.content_hash)) {
      seen.add(packet.content_hash);
      packets.push(packet);
    }
  }
  return packets;
}

/**
 * Normalize an array of raw Reddit posts into evidence packets.
 * Deduplicates by content_hash.
 */
export function normalizeRedditPosts(posts, contextId) {
  const seen = new Set();
  const packets = [];

  for (const post of posts) {
    const packet = normalizeRedditPost(post, contextId);
    if (!seen.has(packet.content_hash)) {
      seen.add(packet.content_hash);
      packets.push(packet);
    }
  }

  return packets;
}
