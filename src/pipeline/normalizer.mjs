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
 * Classify the intent of a piece of evidence.
 * Returns: pain, promotion, insight, question, or comparison.
 */
export function classifyIntent(title, body) {
  const text = ((title || "") + " " + (body || "")).toLowerCase();

  // Order matters — check most specific patterns first
  const patterns = [
    ["promotion", /\b(i built|i created|check out|just launched|just released|my tool|my app|we just shipped|announcing|our team|free trial|launching today)\b|\[oc\]|show hn/],
    ["comparison", /\b(vs\.?|versus)\b| compared to | switched from | alternative to | better than | instead of | moved from .* to /],
    ["pain", /\b(frustrat|annoying|hate|terrible|worst|broken|expensive|cheaper|struggling|overpriced|waste of time|doesn'?t work|can'?t figure|looking for alternative|sick of|fed up|giving up on|too heavy|too complex|too slow|blocker|drowning|pain|nightmare|headache|limitation)\b/],
    ["insight", /\b(here'?s how|my experience|my workflow|i'?ve been using|tutorial|guide|deep dive|breakdown|lessons learned|what i learned|after \d+ (year|month))\b/],
    ["question", /\b(has anyone|what do you use|recommend|best tool for|how do you|what'?s the best|anyone know|suggest|advice|thoughts on|is there a|looking for a|need help|any tool)\b|\?$/],
  ];

  for (const [intent, regex] of patterns) {
    if (regex.test(text)) return intent;
  }

  return "question";
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
    intent: classifyIntent(post.title, post.selftext),
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
    intent: classifyIntent(comment.link_title, comment.body),
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
