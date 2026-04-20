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
 * Classify the awareness level of a piece of evidence.
 * Returns: unaware, problem_aware, solution_aware, product_aware, or most_aware.
 *
 * Based on the Breakthrough Advertising awareness spectrum:
 *   unaware       — don't know they have a problem
 *   problem_aware — know the problem, don't know solutions exist
 *   solution_aware — know solutions exist, exploring options
 *   product_aware — know specific products, may have tried them
 *   most_aware    — comparing, switching, deep evaluation
 *
 * Reddit skews toward problem_aware+ (people post because they know something is wrong),
 * so problem_aware is the fallback.
 */
// TODO: LLM-assist candidate — regex misses nuance in longer text
export function classifyAwareness(title, body) {
  const text = ((title || "") + " " + (body || "")).toLowerCase();

  const patterns = [
    ["most_aware", /\b(switched from|moved to|migrated? (?:from|to)|after \d+ (?:month|year|week)|chose .* over|replaced .* with)\b| vs\.? | versus | comparing /],
    ["product_aware", /\b(i(?:'ve| have) (?:tried|used|tested)|started (?:using|with)|set up|configured|installed|been using|subscribed to|paying for|signed up for)\b/],
    ["solution_aware", /\b(looking for|need (?:a |some )?(?:tool|app|service|solution|platform)|is there (?:a|any)|any (?:tool|app|service)|recommend|alternative|solution for|options for)\b/],
    ["problem_aware", /\b(frustrat|struggling|issue|problem|can'?t|doesn'?t work|broken|stuck|pain|annoying|nightmare|headache|limitation|drowning|blocker)\b/],
    ["unaware", /\b(what is|eli5|heard about|new to|just discovered|anyone know what|what does .* mean|can someone explain)\b/],
  ];

  for (const [level, regex] of patterns) {
    if (regex.test(text)) return level;
  }

  return "problem_aware";
}

/**
 * Compute evidence weight based on source type and community validation.
 *
 * Comments with high upvotes are crowd-validated — they can exceed post value.
 * Posts with high engagement get a mild boost.
 */
export function computeEvidenceWeight(packet) {
  const metrics = typeof packet.metrics === "string"
    ? JSON.parse(packet.metrics)
    : (packet.metrics || {});
  const score = metrics.score || 0;
  const comments = metrics.comments || 0;
  const upvoteRatio = metrics.upvote_ratio || 0;
  const isComment = (packet.source_item_id || "").startsWith("t1_");

  if (isComment) {
    // score=0 → 0.6x a post. score=40+ → 2.6x. High-upvote comments are gold.
    return Math.round((0.6 + Math.min(2.0, score / 20)) * 100) / 100;
  }

  // Posts: mild boost for high engagement, capped at 2.0
  return Math.round((1.0 + Math.min(1.0, upvoteRatio * comments / 50)) * 100) / 100;
}

/**
 * Classify the intent of a piece of evidence.
 * Returns: pain, promotion, insight, question, or comparison.
 */
export function classifyIntent(title, body) {
  const text = ((title || "") + " " + (body || "")).toLowerCase();

  // Order matters — check most specific patterns first.
  // Patterns are broadened to handle real discussion/comment content,
  // not just post titles. Comments often express pain or insight
  // without using the specific trigger phrases from post titles.
  const patterns = [
    ["promotion", /\b(i built|i created|i made|check out|just launched|just released|my tool|my app|we just shipped|announcing|our team|free trial|launching today|now available|we'?re building|open.?source|show hn)\b|\[oc\]/],
    ["comparison", /\b(vs\.?|versus)\b| compared to | switch(?:ed|ing) (?:from|to) | alternative to | better than | instead of | moved (?:from|to) | migrat(?:ed|ing) | replaced .* with | chose .* over | went (?:back|with) /],
    ["pain", /\b(frustrat|annoying|hate|terrible|worst|broken|expensive|cheaper|struggling|overpriced|waste of (?:time|money)|doesn'?t work|can'?t (?:figure|get|find|believe|stand)|looking for alternative|sick of|fed up|giving up|gave up|too (?:heavy|complex|slow|expensive|noisy|basic)|blocker|drowning|pain|nightmare|headache|limitation|useless|garbage|awful|sucks?|disappointed|regret|scam|rip.?off|stopped using|cancelled|unsubscribed|dropped)\b|(?:not worth|no value|complete waste|so slow|kills me|driving me crazy|lost (?:hours|days|weeks)|wasted \d)/],
    ["insight", /\b(here'?s (?:how|what|why)|my experience|my (?:workflow|approach|process|setup)|i'?ve been using|tutorial|guide|deep dive|breakdown|lessons? learned|what i (?:learned|found|discovered)|after \d+ (?:year|month|week)|tip:|pro.?tip|game.?changer|the (?:real|actual|key) (?:issue|problem|reason|trick)|turns out|realized|it'?s actually|the thing (?:is|was)|what worked|ended up)\b/],
    ["question", /\b(has anyone|what do you (?:use|think|recommend)|best (?:tool|way|option|approach) for|how (?:do you|did you|would you|can i|to)|what'?s the best|anyone (?:know|tried|using|found)|suggest(?:ion)?|advice|thoughts on|is there (?:a|any)|looking for (?:a|something)|need (?:help|a tool|something)|any (?:tool|recommendation|idea|suggestion)|which (?:one|tool)|should i|worth (?:it|trying|paying))\b|\?$/],
  ];

  for (const [intent, regex] of patterns) {
    if (regex.test(text)) return intent;
  }

  // Better default: if the text has a question mark anywhere, it's likely a question.
  // Otherwise default to "insight" (someone sharing experience) rather than "question".
  if (text.includes("?")) return "question";
  return "insight";
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

  const packet = {
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
    awareness_level: classifyAwareness(post.title, post.selftext),
    evidence_weight: 1.0,
  };

  packet.evidence_weight = computeEvidenceWeight(packet);
  return packet;
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

  const packet = {
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
    awareness_level: classifyAwareness(comment.link_title, comment.body),
    evidence_weight: 1.0,
  };

  packet.evidence_weight = computeEvidenceWeight(packet);
  return packet;
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
