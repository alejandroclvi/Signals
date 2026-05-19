/**
 * Hacker News "Who is hiring" producer — Economic Commitment layer.
 *
 * Where signal lives: every month, user `whoishiring` posts an "Ask HN:
 * Who is hiring?" thread. Companies reply with hiring posts. Each post
 * is a real economic commitment — a company spending budget on a role
 * that names a specific stack. Searching those comments for "Claude
 * Code" / "Anthropic" / similar tells us which companies are buying
 * into a particular tool stack with their hiring decisions.
 *
 * Two-stage pipeline against HN's Algolia API (no auth needed):
 *   1. Find recent "Who is hiring" parent posts authored by whoishiring.
 *   2. Search comments inside those threads matching the context queries.
 *
 * Each comment becomes one evidence_packet:
 *   source_id    = "hn-hiring"
 *   source_layer = "economic"
 *   source_kind  = "hiring_post"
 *
 * The first author segment of each comment text doubles as company-ish
 * identifier (HN convention: "Company Name | Role | Location | ..."
 * pattern at the start of every hiring comment).
 */

const ALGOLIA_BASE = "https://hn.algolia.com/api/v1";
const DEFAULT_HIRING_THREADS_TO_SCAN = 4;     // most recent N months
const DEFAULT_HITS_PER_QUERY = 30;
const DELAY_MS = 250;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAlgolia(path, params) {
  const url = new URL(`${ALGOLIA_BASE}/${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HN Algolia ${res.status}: ${url.toString()}`);
  return res.json();
}

/**
 * Find the most recent N "Who is hiring" parent posts by user whoishiring.
 * Uses the date-sorted endpoint — the default `/search` ranks by Algolia
 * relevance and returns 2015–2020 threads first, which defeats the entire
 * point of "current hiring signal."
 */
async function findHiringThreads(limit = DEFAULT_HIRING_THREADS_TO_SCAN) {
  const json = await fetchAlgolia("search_by_date", {
    tags: "story,author_whoishiring",
    hitsPerPage: Math.max(limit * 2, 12),
  });
  return (json.hits || [])
    .filter(h => /Who is hiring\??/i.test(h.title || ""))
    .slice(0, limit);
}

function companyFromComment(text) {
  if (!text) return "unknown";
  // HN hiring posts conventionally start with "Company Name | …"
  const first = String(text).replace(/<[^>]+>/g, "").split(/[\|\n\r]/)[0].trim();
  return first.slice(0, 60) || "unknown";
}

function calibrateWeight(comments = 0, recencyDays = 999) {
  // Hiring posts don't really get upvoted directly, so weight by recency.
  let base = 1.0;
  if (recencyDays <= 14) base = 1.8;
  else if (recencyDays <= 35) base = 1.4;
  else if (recencyDays <= 70) base = 1.0;
  else base = 0.8;
  if (comments >= 5) base += 0.2;
  return Math.min(2.0, Math.max(0.7, base));
}

function normalizeHiringComment(hit, contextId, query) {
  const id = `hn-hiring:${hit.objectID}`;
  const url = `https://news.ycombinator.com/item?id=${hit.objectID}`;
  const text = (hit.comment_text || "").replace(/<[^>]+>/g, "").slice(0, 1600);
  const company = companyFromComment(hit.comment_text || "");
  const published = new Date(hit.created_at_i * 1000).toISOString();
  const ageDays = (Date.now() - hit.created_at_i * 1000) / (1000 * 60 * 60 * 24);
  return {
    id,
    context_id: contextId,
    source_id: "hn-hiring",
    source_kind: "hiring_post",
    source_layer: "economic",
    source_item_id: `hnh_${hit.objectID}`,
    url,
    title: `Hiring · ${company}`,
    body: text,
    author_ref: `hn:${hit.author}`,
    community: "hn:whoishiring",
    observed_at: new Date().toISOString(),
    published_at: published,
    metrics: JSON.stringify({
      story_id: hit.story_id,
      parent_id: hit.parent_id,
      company,
      query,
      source: "hn-whoishiring",
    }),
    topics: JSON.stringify([query]),
    raw_ref: JSON.stringify({ algolia_objectID: hit.objectID, story_id: hit.story_id }),
    content_hash: null,
    intent: null,
    awareness_level: null,
    evidence_weight: calibrateWeight(0, ageDays),
    quality_score: null,
    sentiment: null,
    evidence_state: "economic_commitment",
  };
}

async function searchCommentsInThread(query, storyId, { hitsPerPage = DEFAULT_HITS_PER_QUERY } = {}) {
  // Algolia: tag comment + numeric story_id filter
  const json = await fetchAlgolia("search", {
    query,
    tags: "comment",
    numericFilters: `story_id=${storyId}`,
    hitsPerPage,
  });
  return json.hits || [];
}

/**
 * Producer interface — search mode.
 *
 * Args:
 *   contextId   required
 *   queries     required — typically narrow (e.g. ["claude code", "anthropic"])
 *   threads     default 4 — number of recent Who-is-hiring threads to scan
 *   limit       default 30 — hits per query per thread
 */
export const hnHiring = {
  id: "hn-hiring",
  layer: "economic",
  kind: "search",
  async search({ contextId, queries, threads = DEFAULT_HIRING_THREADS_TO_SCAN, limit = DEFAULT_HITS_PER_QUERY } = {}) {
    if (!contextId) throw new Error("contextId required");
    if (!queries?.length) return [];

    const hiringThreads = await findHiringThreads(threads);
    if (!hiringThreads.length) {
      console.warn("[hn-hiring] no Who-is-hiring threads found");
      return [];
    }

    const results = [];
    const seenIds = new Set();
    for (const thread of hiringThreads) {
      for (const q of queries) {
        try {
          const hits = await searchCommentsInThread(q, thread.objectID, { hitsPerPage: limit });
          for (const h of hits) {
            if (seenIds.has(h.objectID)) continue;
            seenIds.add(h.objectID);
            results.push(normalizeHiringComment(h, contextId, q));
          }
          await sleep(DELAY_MS);
        } catch (err) {
          console.error(`[hn-hiring] thread=${thread.objectID} query="${q}" failed:`, err.message);
        }
      }
    }
    return results;
  },
};
