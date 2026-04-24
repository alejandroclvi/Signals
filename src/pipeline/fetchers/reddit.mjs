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
const MAX_RETRIES = 3;

function searchUrl(subreddit, query, sort, limit, { timeFilter } = {}) {
  // Discovery mode: no subreddit → search ALL of Reddit
  // This lets Reddit discover which communities the pain surfaces in,
  // instead of us pre-selecting communities based on assumptions.
  const base = subreddit
    ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json`
    : `https://www.reddit.com/search.json`;
  const url = new URL(base);
  url.searchParams.set("q", query);
  if (subreddit) url.searchParams.set("restrict_sr", "1");
  url.searchParams.set("sort", sort);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("raw_json", "1");
  // Reddit time filter: hour, day, week, month, year, all
  if (timeFilter) url.searchParams.set("t", timeFilter);
  return url;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "SignalsLocalPoC/0.1 by local-developer",
      },
    });

    if (response.ok) return response;

    if (response.status === 429 && attempt < retries) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "0", 10);
      const backoff = Math.max(retryAfter * 1000, DELAY_MS * Math.pow(2, attempt + 1));
      await sleep(backoff);
      continue;
    }

    throw new Error(`Reddit fetch failed ${response.status}: ${url}`);
  }
}

async function fetchListing(subreddit, query, sort, limit, { timeFilter } = {}) {
  const url = searchUrl(subreddit, query, sort, limit, { timeFilter });
  const response = await fetchWithRetry(url);
  const json = await response.json();
  return (json?.data?.children || []).map(child => ({
    ...child.data,
    _subreddit_query: query,
    _subreddit_target: subreddit || child.data.subreddit || "discovered",
  }));
}

/**
 * Convert afterDate/beforeDate to Reddit's closest `t` param.
 * Reddit only supports: hour, day, week, month, year, all.
 * We pick the smallest window that covers the afterDate.
 */
function dateToRedditTimeFilter(afterDate) {
  if (!afterDate) return undefined;
  const after = new Date(afterDate);
  const now = new Date();
  const diffDays = (now - after) / (1000 * 60 * 60 * 24);
  if (diffDays <= 1) return "day";
  if (diffDays <= 7) return "week";
  if (diffDays <= 30) return "month";
  if (diffDays <= 365) return "year";
  return "all";
}

/**
 * Fetch Reddit search results for all subreddit+query combinations.
 * Returns an array of raw Reddit post objects.
 *
 * Optional time window:
 *   afterDate  — ISO date string, only include posts after this date
 *   beforeDate — ISO date string, only include posts before this date
 */
export async function fetchReddit({ subreddits, queries, limitPerQuery, sort, afterDate, beforeDate, onProgress }) {
  const limit = Math.max(1, Math.min(limitPerQuery || DEFAULT_LIMIT, 25));
  const sortBy = sort || DEFAULT_SORT;
  const results = [];
  const timeFilter = dateToRedditTimeFilter(afterDate);

  // Client-side date boundaries (Reddit's t= param is coarse, so we filter precisely after fetch)
  const afterTs = afterDate ? new Date(afterDate).getTime() / 1000 : null;
  const beforeTs = beforeDate ? new Date(beforeDate).getTime() / 1000 : null;

  // Discovery mode: empty subreddits → search all of Reddit per query
  // The avatar's pain phrases go to Reddit's global search, which discovers
  // the communities where those conversations actually happen.
  const subs = subreddits && subreddits.length > 0 ? subreddits : [null];

  for (const subreddit of subs) {
    for (const query of queries) {
      try {
        const posts = await fetchListing(subreddit, query, sortBy, limit, { timeFilter });
        // Apply precise date filtering
        const filtered = posts.filter(p => {
          const ts = p.created_utc || 0;
          if (afterTs && ts < afterTs) return false;
          if (beforeTs && ts > beforeTs) return false;
          return true;
        });
        results.push(...filtered);
        if (onProgress) onProgress({ subreddit: subreddit || "all", query, count: filtered.length });
        await sleep(DELAY_MS);
      } catch (err) {
        if (onProgress) onProgress({ subreddit: subreddit || "all", query, count: 0, error: err.message });
      }
    }
  }

  return results;
}

/**
 * Fetch top-level comments for a Reddit post.
 * Uses the post's permalink to get the comment listing.
 *
 * Returns an array of raw Reddit comment objects (top-level only).
 */
export async function fetchPostComments(permalink, { limit = 10, onProgress } = {}) {
  // permalink looks like "/r/sub/comments/id/title/"
  const url = new URL(`https://www.reddit.com${permalink}.json`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("depth", "1");
  url.searchParams.set("raw_json", "1");

  try {
    const response = await fetchWithRetry(url);
    const json = await response.json();
    // Reddit returns [post_listing, comment_listing]
    const commentListing = json[1];
    if (!commentListing?.data?.children) return [];

    return commentListing.data.children
      .filter(c => c.kind === "t1" && c.data.body)
      .slice(0, limit)
      .map(c => ({
        ...c.data,
        _post_permalink: permalink,
      }));
  } catch (err) {
    if (onProgress) onProgress({ permalink, count: 0, error: err.message });
    return [];
  }
}
