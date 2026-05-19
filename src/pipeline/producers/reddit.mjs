/**
 * Reddit producer — adapter over the existing fetcher + normalizer so the
 * registry can fan queries out to Reddit alongside hackernews / polymarket.
 *
 * Conversation layer, search mode. Defaults to discovery mode (no subreddits →
 * global Reddit search). IDs and content hashes match `pnpm ingest`, so the
 * INSERT OR IGNORE in ingest-multi / cast-net dedupes across both paths.
 */

import { fetchReddit } from "../fetchers/reddit.mjs";
import { normalizeRedditPosts } from "../normalizer.mjs";

export const reddit = {
  id: "reddit",
  layer: "conversation",
  kind: "search",
  async search({ contextId, queries, subreddits = [], limit, limitPerQuery, sort, afterDate, beforeDate }) {
    if (!contextId) throw new Error("contextId required");
    const perQuery = limitPerQuery ?? limit;
    const posts = await fetchReddit({
      subreddits,
      queries,
      limitPerQuery: perQuery,
      sort,
      afterDate,
      beforeDate,
    });
    return normalizeRedditPosts(posts, contextId);
  },
};
