/**
 * Reddit fetcher — pulls search results from Reddit's public JSON API.
 * No OAuth required. Uses the same approach as the prototype pull script.
 *
 * Input: { subreddits: string[], queries: string[], limitPerQuery?: number, sort?: string }
 * Output: raw Reddit post objects grouped by query
 */

const DEFAULT_LIMIT = 12;
const DEFAULT_SORT = "new";
const DELAY_MS = 1200;

function searchUrl(subreddit, query, sort, limit) {
  const url = new URL(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json`);
  url.searchParams.set("q", query);
  url.searchParams.set("restrict_sr", "1");
  url.searchParams.set("sort", sort);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("raw_json", "1");
  return url;
}

async function fetchListing(subreddit, query, sort, limit) {
  const url = searchUrl(subreddit, query, sort, limit);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SignalsLocalPoC/0.1 by local-developer",
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit search failed ${response.status}: ${url}`);
  }

  const json = await response.json();
  return (json?.data?.children || []).map(child => ({
    ...child.data,
    _subreddit_query: query,
    _subreddit_target: subreddit,
  }));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch Reddit search results for all subreddit+query combinations.
 * Returns an array of raw Reddit post objects.
 */
export async function fetchReddit({ subreddits, queries, limitPerQuery, sort, onProgress }) {
  const limit = Math.max(1, Math.min(limitPerQuery || DEFAULT_LIMIT, 25));
  const sortBy = sort || DEFAULT_SORT;
  const results = [];

  for (const subreddit of subreddits) {
    for (const query of queries) {
      try {
        const posts = await fetchListing(subreddit, query, sortBy, limit);
        results.push(...posts);
        if (onProgress) onProgress({ subreddit, query, count: posts.length });
        await sleep(DELAY_MS);
      } catch (err) {
        if (onProgress) onProgress({ subreddit, query, count: 0, error: err.message });
      }
    }
  }

  return results;
}
