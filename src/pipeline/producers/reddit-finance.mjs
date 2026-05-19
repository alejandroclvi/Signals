/**
 * Reddit-finance producer — Capital-market response layer.
 *
 * Same fetcher + normalizer as the conversation-layer Reddit producer, but
 * scoped to finance subreddits (wallstreetbets, stocks, investing,
 * SecurityAnalysis, ValueInvesting) and re-labeled with source_layer="capital"
 * so it shows up under Capital-market response instead of Conversation.
 *
 * Why a separate producer: capital chatter is structurally different from
 * product chatter. Same evidence shape, but different scoring intent.
 * Searching r/wallstreetbets for "anthropic" surfaces retail traders'
 * reactions to AI sector news — distinct signal from r/ClaudeCode posts.
 */

import { fetchReddit } from "../fetchers/reddit.mjs";
import { normalizeRedditPosts } from "../normalizer.mjs";

const DEFAULT_FINANCE_SUBS = [
  "wallstreetbets",
  "stocks",
  "investing",
  "SecurityAnalysis",
  "ValueInvesting",
  "options",
  "Daytrading",
];

// Default capital-market-flavored queries — used when the context's own
// queries are too product-specific to surface in finance subs. Caller can
// pass `queries` explicitly to override.
const DEFAULT_QUERIES = [
  "anthropic",
  "claude AI stock",
  "Nvidia AI bubble",
  "MSFT Anthropic",
  "AMZN Anthropic",
  "AI capex",
];

function relabelAsCapital(packets) {
  // Override the conversation-layer label that normalizeRedditPosts assigned.
  // Also prefix the id so we don't collide with the conversation-layer Reddit
  // producer's evidence for the same post (rare, but possible if a finance
  // sub picks up a Claude story).
  return packets.map(p => ({
    ...p,
    id: `reddit-finance:${p.source_item_id}`,
    source_id: "reddit-finance",
    source_layer: "capital",
    source_kind: p.source_kind || "post",
  }));
}

export const redditFinance = {
  id: "reddit-finance",
  layer: "capital",
  kind: "search",
  async search({ contextId, queries, subreddits, limitPerQuery, sort, afterDate, beforeDate, limit }) {
    if (!contextId) throw new Error("contextId required");
    const subs = (subreddits && subreddits.length) ? subreddits : DEFAULT_FINANCE_SUBS;
    const qlist = (queries && queries.length) ? queries : DEFAULT_QUERIES;
    const perQuery = limitPerQuery ?? limit;
    const posts = await fetchReddit({
      subreddits: subs,
      queries: qlist,
      limitPerQuery: perQuery,
      sort,
      afterDate,
      beforeDate,
    });
    const packets = normalizeRedditPosts(posts, contextId);
    return relabelAsCapital(packets);
  },
};
