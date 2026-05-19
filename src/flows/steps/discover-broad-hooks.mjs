/**
 * Discover candidate LinkedIn hooks via TWO complementary channels:
 *
 *   1. Engagement-driven (primary) — pull top-week + hot from broad-interest
 *      subs without a query. The LLM classifier downstream finds the hook
 *      archetypes among what already proved to engage.
 *
 *   2. Pattern-driven (supplementary, off by default) — for a small set of
 *      high-precision narrative phrases, search across subs to surface posts
 *      that didn't crack the top tier but match a known hook pattern.
 *
 * Plus HN: front-page stories + targeted hook-pattern searches.
 *
 * Args: {
 *   topic?: string                — when set, biases pattern search; engagement pull ignores it
 *   subs?: string                  — comma-separated; default = curated 10 broad subs
 *   patterns?: string              — pipe-separated phrases; default = small high-precision set
 *   includePatternSearch?: boolean — supplementary phase (default false; engagement is enough)
 *   sinceDays?: number             — recency cap (default 14)
 *   topPerSub?: number             — top-week limit per sub (default 30)
 *   hotPerSub?: number             — hot limit per sub (default 20)
 *   minTitleLen?: number           — skip thin titles (default 28)
 *   includeHN?: boolean            — pull HN front-page (default true)
 *   hnMinPoints?: number           — HN engagement floor (default 30)
 *   hnLimit?: number               — HN pulls (default 40)
 * }
 * Returns: { hooks, totalQueries, channels: { engagement, pattern, hn } }
 */

import { searchHN } from "../../pipeline/producers/hackernews.mjs";

const DEFAULT_SUBS = [
  "Futurology",
  "technology",
  "Singularity",
  "OpenAI",
  "ChatGPT",
  "artificial",
  "Economics",
  "geopolitics",
  "business",
  "MachineLearning",
];

// Smaller, high-precision pattern set. Pattern phase is supplementary.
const DEFAULT_PATTERNS = [
  "is quietly",
  "is secretly",
  "the truth about",
  "is dying",
  "is the new",
];

const REDDIT_DELAY_MS = 1100;
const UA = "SignalsHookRadar/0.2 (by local-developer)";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function passesTitleFilter(post, minLen) {
  const t = post.title || "";
  if (t.length < minLen || t.length > 240) return false;
  if (post.is_video || post.post_hint === "image" || post.post_hint === "hosted:video") return false;
  // Skip pure-link posts where title is just a URL or domain
  if (/^https?:\/\//.test(t.trim())) return false;
  if (t.split(/\s+/).length < 4) return false;
  return true;
}

async function redditFetch(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!res.ok) {
    if (res.status === 429) await sleep(3000);
    return null;
  }
  return res.json();
}

async function pullSubBucket(sub, kind, sinceTs, limit) {
  // kind = "top" (with t=week) or "hot"
  const params = kind === "top"
    ? `?t=week&limit=${limit}&raw_json=1`
    : `?limit=${limit}&raw_json=1`;
  const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/${kind}.json${params}`;
  const json = await redditFetch(url);
  if (!json) return [];
  const children = json?.data?.children || [];
  return children
    .map(c => c.data)
    .filter(d => d && d.title && d.created_utc >= sinceTs);
}

async function fetchRedditPattern(sub, query, limit, sinceTs) {
  const url = new URL(`https://www.reddit.com/r/${encodeURIComponent(sub)}/search.json`);
  url.searchParams.set("q", `"${query}"`);
  url.searchParams.set("restrict_sr", "1");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("t", "month");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("raw_json", "1");
  const json = await redditFetch(url.toString());
  if (!json) return [];
  return (json?.data?.children || [])
    .map(c => c.data)
    .filter(d => d && d.title && d.created_utc >= sinceTs);
}

function postToHook(d, channel, queryLabel) {
  return {
    title: d.title,
    url: `https://www.reddit.com${d.permalink}`,
    source: "reddit",
    community: `r/${d.subreddit}`,
    upvotes: d.ups || d.score || 0,
    comments: d.num_comments || 0,
    date: new Date(d.created_utc * 1000).toISOString().slice(0, 10),
    channel,
    query: queryLabel,
    body_excerpt: (d.selftext || "").slice(0, 240).replace(/\s+/g, " "),
  };
}

async function pullHnFrontPage(limit, minPoints, sinceISO) {
  // HN Algolia: search by date for any story tagged front_page with points > minPoints
  const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
  url.searchParams.set("tags", "story,front_page");
  url.searchParams.set("hitsPerPage", String(limit));
  url.searchParams.set("numericFilters", `points>=${minPoints},created_at_i>${Math.floor(new Date(sinceISO).getTime() / 1000)}`);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json = await res.json();
  const hits = json?.hits || [];
  return hits.map(h => ({
    title: h.title || "",
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    source: "hackernews",
    community: "hn:front_page",
    upvotes: h.points || 0,
    comments: h.num_comments || 0,
    date: new Date((h.created_at_i || 0) * 1000).toISOString().slice(0, 10),
    channel: "engagement",
    query: "hn:front_page",
    body_excerpt: (h.story_text || "").slice(0, 240).replace(/<[^>]+>/g, "").replace(/\s+/g, " "),
  }));
}

export default async function discoverBroadHooks({
  topic = "",
  subs = "",
  patterns = "",
  includePatternSearch = false,
  sinceDays = 14,
  topPerSub = 30,
  hotPerSub = 20,
  minTitleLen = 28,
  includeHN = true,
  hnMinPoints = 30,
  hnLimit = 40,
} = {}) {
  minTitleLen = Number(minTitleLen) || 28;
  sinceDays = Number(sinceDays) || 14;
  topPerSub = Number(topPerSub) || 30;
  hotPerSub = Number(hotPerSub) || 20;

  const subList = (typeof subs === "string" && subs) ? subs.split(",").map(s => s.trim()).filter(Boolean) : DEFAULT_SUBS;
  const patternList = (typeof patterns === "string" && patterns) ? patterns.split("|").map(s => s.trim()).filter(Boolean) : DEFAULT_PATTERNS;
  const usePatterns = includePatternSearch === true || includePatternSearch === "true";
  const sinceTs = Math.floor(Date.now() / 1000) - sinceDays * 86400;
  const sinceISO = new Date(sinceTs * 1000).toISOString();

  const seenUrls = new Set();
  const hooks = [];
  let qEng = 0, qPat = 0, qHn = 0;

  // ─── Channel 1: ENGAGEMENT (top-week + hot per sub) ─────────────────────
  for (const sub of subList) {
    for (const kind of ["top", "hot"]) {
      try {
        const limit = kind === "top" ? topPerSub : hotPerSub;
        const items = await pullSubBucket(sub, kind, sinceTs, limit);
        qEng++;
        for (const d of items) {
          if (!passesTitleFilter(d, minTitleLen)) continue;
          const hook = postToHook(d, "engagement", `${kind}:${sub}`);
          if (seenUrls.has(hook.url)) continue;
          seenUrls.add(hook.url);
          hooks.push(hook);
        }
      } catch { /* skip individual sub failure */ }
      await sleep(REDDIT_DELAY_MS);
    }
  }

  // ─── Channel 2: PATTERN SEARCH (optional, supplementary) ───────────────
  if (usePatterns) {
    for (const sub of subList) {
      for (const pat of patternList) {
        const q = topic ? `${pat} ${topic}` : pat;
        try {
          const items = await fetchRedditPattern(sub, q, 6, sinceTs);
          qPat++;
          for (const d of items) {
            if (!passesTitleFilter(d, minTitleLen)) continue;
            const hook = postToHook(d, "pattern", q);
            if (seenUrls.has(hook.url)) continue;
            seenUrls.add(hook.url);
            hooks.push(hook);
          }
        } catch { /* skip */ }
        await sleep(REDDIT_DELAY_MS);
      }
    }
  }

  // ─── Channel 3: HN front page + optional pattern queries ───────────────
  if (includeHN) {
    try {
      const hnEng = await pullHnFrontPage(hnLimit, hnMinPoints, sinceISO);
      qHn++;
      for (const h of hnEng) {
        if (!h.title || h.title.length < minTitleLen) continue;
        if (seenUrls.has(h.url)) continue;
        seenUrls.add(h.url);
        hooks.push(h);
      }
    } catch { /* skip */ }

    if (usePatterns) {
      for (const pat of patternList) {
        const q = topic ? `${pat} ${topic}` : pat;
        try {
          const packets = await searchHN(q, {
            contextId: "tmp-hook-radar",
            hitsPerPage: 6,
            afterDate: sinceISO,
            includeStories: true,
            includeComments: false,
          });
          qHn++;
          for (const p of packets) {
            if (seenUrls.has(p.url)) continue;
            if (!p.title || p.title.length < minTitleLen) continue;
            seenUrls.add(p.url);
            const m = (() => { try { return JSON.parse(p.metrics); } catch { return {}; } })();
            hooks.push({
              title: p.title,
              url: p.url,
              source: "hackernews",
              community: p.community,
              upvotes: m.points || 0,
              comments: m.comments || 0,
              date: p.published_at?.slice(0, 10) || "",
              channel: "pattern",
              query: q,
              body_excerpt: (p.body || "").replace(/<[^>]+>/g, "").slice(0, 240).replace(/\s+/g, " "),
            });
          }
        } catch { /* skip */ }
      }
    }
  }

  hooks.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
  return {
    hooks,
    totalQueries: qEng + qPat + qHn,
    channels: { engagement: qEng, pattern: qPat, hn: qHn },
    sinceDays,
    subsSearched: subList.length,
  };
}
