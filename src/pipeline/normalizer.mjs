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
 * Classify the sentiment of a piece of evidence toward its subject.
 * Returns: positive, negative, neutral, or mixed.
 *
 * Unlike intent (what they're doing) or awareness (how much they know),
 * sentiment captures how they FEEL. A "question" intent can be negative
 * ("has anyone else found X completely useless?") or neutral ("anyone tried X?").
 *
 * Strategy:
 *   - Score positive and negative indicators independently
 *   - Both high → mixed (common in reviews: "it's great but...")
 *   - Neither high → neutral
 *   - One dominant → that sentiment
 *   - Negation handling: "not great", "don't recommend" flip positive → negative
 */
export function classifySentiment(title, body) {
  const text = ((title || "") + " " + (body || "")).toLowerCase();

  // Negation-aware: check for negated positives (count as negative)
  const negatedPositive = /\b(not (?:worth|great|good|impressed|helpful|useful|reliable|recommend)|don'?t (?:recommend|bother|waste|like|trust)|wouldn'?t (?:recommend|suggest|use)|can'?t recommend|isn'?t (?:worth|great|good)|wasn'?t (?:impressed|helpful)|doesn'?t (?:work|deliver|live up|help)|never (?:worked|delivered|again|using))\b/;

  let positiveScore = 0;
  let negativeScore = 0;

  // --- Negative signals ---
  const negativeStrong = /\b(terrible|awful|horrible|worst|nightmare|scam|rip.?off|garbage|trash|useless|joke|disaster|complete waste|total waste|regret|avoid|stay away|don'?t buy|waste of money|waste of time|wouldn'?t touch|absolute.?garbage|piece of (?:crap|junk))\b/;
  const negativeMedium = /\b(frustrat|annoying|disappoint|overpriced|expensive for what|mediocre|underwhelm|broken|buggy|unreliable|slow|clunky|confusing|lacking|insufficient|subpar|inferior|outdated|bloated|overkill|overhyped|fell short|let.?down|not.?worth|poor (?:quality|support|experience|value)|bad (?:experience|support))\b/;
  const negativeLight = /\b(meh|okay.?ish|not great|could be better|leaves.?much|room for improvement|basic|limited|so-so|nothing special|unimpressed)\b/;

  if (negatedPositive.test(text)) negativeScore += 3;
  if (negativeStrong.test(text)) negativeScore += 4;
  if (negativeMedium.test(text)) negativeScore += 2;
  if (negativeLight.test(text)) negativeScore += 1;

  // --- Positive signals ---
  const positiveStrong = /\b(game.?changer|life.?changing|love (?:it|this)|absolutely (?:love|amazing|incredible)|best (?:tool|thing|decision|purchase)|highly recommend|can'?t live without|worth every (?:penny|cent|dollar)|10\/10|must.?have|holy grail|saved (?:my|our) (?:life|business|sanity|team)|blown away|exceeded expectations)\b/;
  const positiveMedium = /\b(great (?:tool|product|experience|value|support)|works (?:great|well|perfectly|beautifully)|really (?:good|helpful|useful|impressed)|solid (?:tool|product|choice)|happy with|pleased with|impressed (?:by|with)|recommend|reliable|intuitive|seamless|smooth|elegant|clean|powerful|efficient|productive|worth (?:it|trying|paying))\b/;
  const positiveLight = /\b(decent|good enough|fine|works|helpful|useful|not bad|pretty good|fair|adequate|does the job|gets the job done)\b/;

  // Don't count positive if it's negated
  if (!negatedPositive.test(text)) {
    if (positiveStrong.test(text)) positiveScore += 4;
    if (positiveMedium.test(text)) positiveScore += 2;
    if (positiveLight.test(text)) positiveScore += 1;
  }

  // --- Classify ---
  if (positiveScore >= 3 && negativeScore >= 3) return "mixed";
  if (positiveScore >= 3 && negativeScore < 2) return "positive";
  if (negativeScore >= 3 && positiveScore < 2) return "negative";
  if (positiveScore >= 1 && negativeScore >= 1) return "mixed";
  if (positiveScore >= 1) return "positive";
  if (negativeScore >= 1) return "negative";
  return "neutral";
}

/**
 * Classify the EVIDENCE STATE — a single dimension that tells you
 * what this evidence means for the market.
 *
 * States (in priority order):
 *   promoting       — they're selling something (lowest trust)
 *   comparing       — structured comparison of tools/approaches
 *   tried_failed    — used a specific tool, didn't work
 *   warning         — telling others to avoid something
 *   seeking         — actively looking for a solution
 *   found_what_works — found something that works, sharing positive
 *   sharing_insight — sharing knowledge, workarounds, experience
 *   experiencing_pain — describes the problem/frustration without mentioning tools
 *
 * Replaces the old 3-dimension system (intent × awareness × sentiment)
 * with a single story-driven label.
 */
export function classifyEvidenceState(title, body) {
  const text = ((title || "") + " " + (body || "")).toLowerCase();

  // 1. Promoting — selling their own thing
  if (/\b(i built|i created|i made|check out (?:my|our)|just launched|just released|we just shipped|announcing|our team (?:built|made)|launching today|now available|we'?re building|show hn)\b|\[oc\]/.test(text))
    return "promoting";

  // 2. Comparing — structured tool comparison
  if (/\b(vs\.?|versus)\b|head.to.head|compared .{3,30} (?:to|with|against)|tested .{3,20} and .{3,20}|which (?:one|is better)|side.by.side/.test(text))
    return "comparing";

  // 3. Tried and failed — mentions a tool/approach + negative outcome
  const hasToolRef = /\b[A-Z][a-z]+(?:\.(?:io|ai|com))?\b/.test((body || "") + " " + (title || ""));
  const hasNegative = /\b(didn'?t work|waste|terrible|awful|garbage|useless|overpriced|broken|cancelled|unsubscribed|stopped using|gave up|disappointing|not worth|too expensive|fell short|let.?down|made it worse|regret|worse than|couldn'?t handle|failed|unreliable|buggy|unusable|mess|disaster|nightmare|horrible|sucks)\b/.test(text);
  const hasTriedVerb = /\b(tried|used|tested|paid for|subscribed|signed up|switched from|gave .{1,10} a (?:shot|try)|relied on|depended on|went all.?in|adopted|integrated|deployed|shipped with)\b/.test(text);
  if (hasTriedVerb && hasNegative) return "tried_failed";
  if (hasToolRef && hasNegative && hasTriedVerb) return "tried_failed";

  // 4. Warning — actively telling others to avoid
  if (/\b(don'?t (?:waste|bother|buy|use|pay)|stay away|avoid|wouldn'?t recommend|save your (?:money|time)|complete waste|worst (?:mistake|decision)|do not (?:buy|use|sign up))\b/.test(text))
    return "warning";

  // 5. Seeking — looking for a solution
  if (/\b(looking for|is there (?:a|any)|has anyone (?:found|tried|used)|recommend|any (?:tool|app|service|suggestion)|best (?:tool|way|option|approach) (?:for|to)|how (?:do you|did you|can i|to)|what(?:'s| is) the best|need (?:a |some )?(?:tool|help|solution)|suggest|alternative to|worth (?:trying|it|paying))\b/.test(text))
    return "seeking";

  // 6. Found what works — positive experience with specific solution
  const hasPositive = /\b(game.?changer|love (?:it|this)|works (?:great|perfectly|well)|highly recommend|worth every|can'?t live without|saved (?:my|our)|really (?:good|helpful|impressed)|solid|happy with|pleased|exceeded)\b/.test(text);
  if (hasToolRef && hasPositive) return "found_what_works";
  if (hasTriedVerb && hasPositive) return "found_what_works";

  // 7. Sharing insight — knowledge, experience, workarounds
  if (/\b(here'?s (?:how|what|why)|my (?:experience|workflow|approach|process|setup)|what i (?:learned|found|discovered)|tip:|pro.?tip|after \d+ (?:year|month|week)|lessons? learned|the (?:real|actual|key) (?:issue|problem|reason|trick)|turns out|realized|it'?s actually|what worked|ended up)\b/.test(text))
    return "sharing_insight";

  // 8. Experiencing pain — frustration/problem described from experience
  if (/\b(frustrat|struggling|nightmare|broken|expensive|exhausting|drowning|stuck|headache|pain|can'?t (?:figure|get|find|believe|stand|understand|maintain|debug|read)|sick of|fed up|annoying|waste of (?:time|money)|losing (?:my mind|sleep|hours|days)|driving me crazy|pulling my hair|want to quit|burned out|regret|technical debt|unmaintainable|unreadable|spaghetti|mess|disaster|impossible to (?:debug|maintain|read|understand|refactor)|spent (?:hours|days|weeks) (?:debugging|fixing|trying)|keeps? breaking|constantly breaking|every time .{1,20} breaks)\b/.test(text))
    return "experiencing_pain";

  // Fallback
  if (text.includes("?")) return "seeking";
  return "sharing_insight";
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
    sentiment: classifySentiment(post.title, post.selftext),
    evidence_state: classifyEvidenceState(post.title, post.selftext),
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
    sentiment: classifySentiment(comment.link_title, comment.body),
    evidence_state: classifyEvidenceState(comment.link_title, comment.body),
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
