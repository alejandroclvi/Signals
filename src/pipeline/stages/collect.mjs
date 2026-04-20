/**
 * Stage 1: Collection — fetch evidence from Reddit.
 *
 * Two modes:
 *   TARGETED: subreddits[] + queries[] → Reddit per-subreddit search (old approach)
 *   DISCOVERY: empty subreddits + queries[] → Google "site:reddit.com" → fetch threads
 *
 * Discovery mode uses Playwright to search Google with pain phrases,
 * letting Google discover which subreddits the conversations live in.
 * This is the ad framework's 3-pass research methodology applied to ingestion.
 *
 * Quality gate:
 *   - Reject: empty body, deleted author, score < -2
 *   - Pass threshold: >= 3 valid packets per run
 */

import { fetchReddit, fetchPostComments } from "../fetchers/reddit.mjs";
import { discoverRedditThreads, redditJsonUrl } from "../fetchers/google-discover.mjs";
import { normalizeRedditPosts, normalizeRedditComments } from "../normalizer.mjs";

const DELAY_MS = 1200;
const COMMENT_THRESHOLD = 5;
const COMMENT_LIMIT = 8;

export async function collect({ contextId, subreddits, queries, limitPerQuery, sort, existingIds, existingSourceItems, onProgress }) {
  const errors = [];
  const isDiscovery = !subreddits || subreddits.length === 0;

  let rawPosts = [];

  if (isDiscovery) {
    // ── DISCOVERY MODE ──
    // Google search → Reddit URLs → fetch threads
    if (onProgress) onProgress({ stage: "collect", message: "Discovery mode: searching Google for Reddit threads..." });

    const discovered = await discoverRedditThreads(queries, {
      resultsPerQuery: limitPerQuery || 10,
      onProgress: (info) => {
        if (info.error) errors.push(info.error);
        if (info.stage === "discovery-complete") {
          if (onProgress) onProgress({ stage: "collect", message: "Google discovered " + info.total + " unique Reddit threads (" + info.duplicatesRemoved + " duplicates removed)" });
        } else if (info.query) {
          if (onProgress) onProgress({ stage: "collect", message: "  \"" + info.query.slice(0, 60) + "\" → " + info.found + " threads" });
        }
      },
    });

    if (!discovered.length) {
      if (onProgress) onProgress({ stage: "collect", message: "No Reddit threads discovered." });
      return {
        output: { evidencePackets: [], rawPosts: [] },
        stats: { fetched: 0, normalized: 0, new: 0, comments: 0, discovered: 0, errors: errors.length },
        gate: { passed: true, reason: "No threads discovered — nothing to gate" },
        errors,
      };
    }

    // Fetch each discovered thread via Reddit JSON API
    if (onProgress) onProgress({ stage: "collect", message: "Fetching " + discovered.length + " discovered threads from Reddit..." });

    for (const thread of discovered) {
      try {
        const url = redditJsonUrl(thread.url);
        const response = await fetchWithRetry(url);
        const json = await response.json();

        // First element is the post listing
        const postListing = json[0];
        if (postListing?.data?.children?.[0]) {
          const post = postListing.data.children[0].data;
          post._subreddit_query = thread.query;
          post._subreddit_target = thread.subreddit;
          post._discovered_via = "google";
          rawPosts.push(post);

          // Comments are in the second element
          const commentListing = json[1];
          if (commentListing?.data?.children) {
            const comments = commentListing.data.children
              .filter(c => c.kind === "t1" && c.data.body)
              .slice(0, COMMENT_LIMIT)
              .map(c => ({
                ...c.data,
                _post_permalink: post.permalink,
                _topic: thread.query,
                link_title: post.title || "",
              }));
            // Store comments alongside post for normalization
            post._fetched_comments = comments;
          }
        }

        await new Promise(r => setTimeout(r, DELAY_MS));
      } catch (err) {
        errors.push("Thread fetch failed: " + thread.url + " — " + err.message);
      }
    }

    if (onProgress) onProgress({ stage: "collect", message: "Fetched " + rawPosts.length + " threads with comments" });

  } else {
    // ── TARGETED MODE ──
    // Per-subreddit search (existing behavior)
    if (onProgress) onProgress({ stage: "collect", message: "Targeted mode: searching " + subreddits.length + " subreddits..." });

    rawPosts = await fetchReddit({
      subreddits,
      queries,
      limitPerQuery: limitPerQuery || 12,
      sort: sort || "new",
      onProgress: (info) => {
        if (info.error) errors.push(info.error);
        if (onProgress) onProgress({ stage: "collect", ...info });
      },
    });
  }

  if (!rawPosts.length) {
    return {
      output: { evidencePackets: [], rawPosts: [] },
      stats: { fetched: 0, normalized: 0, new: 0, comments: 0, errors: errors.length },
      gate: { passed: true, reason: "No posts found — nothing to gate" },
      errors,
    };
  }

  // Normalize posts
  if (onProgress) onProgress({ stage: "collect", message: "Normalizing " + rawPosts.length + " posts..." });
  const allNormalized = normalizeRedditPosts(rawPosts, contextId);

  // Resume: skip already-ingested
  const evidencePackets = allNormalized.filter(ep => !existingIds.has(ep.id));
  const skippedPosts = allNormalized.length - evidencePackets.length;
  if (skippedPosts > 0 && onProgress) {
    onProgress({ stage: "collect", message: "Skipped " + skippedPosts + " already-ingested, " + evidencePackets.length + " new" });
  }

  // Normalize comments from discovery mode (already fetched inline)
  let commentsFetched = 0;
  if (isDiscovery) {
    const seenHashes = new Set(evidencePackets.map(ep => ep.content_hash));
    for (const post of rawPosts) {
      if (post._fetched_comments && post._fetched_comments.length > 0) {
        const commentPackets = normalizeRedditComments(post._fetched_comments, contextId, seenHashes);
        const newComments = commentPackets.filter(ep => !existingIds.has(ep.id));
        evidencePackets.push(...newComments);
        commentsFetched += newComments.length;
      }
    }
  } else {
    // Targeted mode: fetch comments for high-engagement posts
    const seenPermalinks = new Set();
    const highEngagement = rawPosts.filter(p => {
      if ((p.num_comments || 0) < COMMENT_THRESHOLD || !p.permalink) return false;
      if (seenPermalinks.has(p.permalink)) return false;
      seenPermalinks.add(p.permalink);
      const postItemId = p.name || ("t3_" + p.id);
      if (existingSourceItems.has(postItemId) && skippedPosts > 0) return false;
      return true;
    });

    if (highEngagement.length > 0) {
      if (onProgress) onProgress({ stage: "collect", message: "Fetching comments for " + highEngagement.length + " posts..." });

      const seenHashes = new Set(evidencePackets.map(ep => ep.content_hash));

      for (const post of highEngagement) {
        if (!post.permalink) continue;
        const comments = await fetchPostComments(post.permalink, {
          limit: COMMENT_LIMIT,
          onProgress: (info) => { if (info.error) errors.push(info.error); },
        });

        if (comments.length > 0) {
          for (const c of comments) {
            c._topic = post._subreddit_query || "";
            c.link_title = post.title || "";
          }
          const commentPackets = normalizeRedditComments(comments, contextId, seenHashes);
          const newComments = commentPackets.filter(ep => !existingIds.has(ep.id));
          evidencePackets.push(...newComments);
          commentsFetched += newComments.length;
        }

        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
  }

  if (commentsFetched > 0 && onProgress) {
    onProgress({ stage: "collect", message: commentsFetched + " comments, " + evidencePackets.length + " total evidence" });
  }

  // Quality gate
  const before = evidencePackets.length;
  const filtered = evidencePackets.filter(ep => {
    if (!ep.body || ep.body.trim().length < 20) return false;
    if (ep.author_ref === "deleted_or_unknown") return false;
    const metrics = typeof ep.metrics === "string" ? JSON.parse(ep.metrics) : (ep.metrics || {});
    if ((metrics.score || 0) < -2) return false;
    return true;
  });
  const rejected = before - filtered.length;

  const passed = filtered.length >= 3 || (filtered.length > 0 && before < 10);

  return {
    output: { evidencePackets: filtered, rawPosts },
    stats: {
      mode: isDiscovery ? "discovery" : "targeted",
      fetched: rawPosts.length,
      normalized: allNormalized.length,
      new: before,
      comments: commentsFetched,
      gateRejected: rejected,
      gatePassCount: filtered.length,
      errors: errors.length,
    },
    gate: {
      passed,
      reason: passed
        ? filtered.length + " packets passed collection gate (" + rejected + " rejected)"
        : "Only " + filtered.length + " packets survived collection gate (need >= 3)",
    },
    errors,
  };
}

// Retry helper (same as reddit.mjs)
async function fetchWithRetry(url, retries = 3) {
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
      const backoff = Math.max(retryAfter * 1000, 1200 * Math.pow(2, attempt + 1));
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }
    throw new Error(`Reddit fetch failed ${response.status}: ${url}`);
  }
}
