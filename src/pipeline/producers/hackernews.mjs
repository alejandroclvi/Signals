/**
 * Hacker News producer — Algolia search API, no auth.
 *
 * Conversation layer, independent source from Reddit. Returns evidence packets
 * shape-compatible with existing schema. Weight calibrated to Reddit's 0–2.6 range.
 */

const ALGOLIA_BASE = "https://hn.algolia.com/api/v1";
const DEFAULT_HITS = 30;
const DELAY_MS = 250;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function calibrateWeight(kind, points = 0, comments = 0) {
  if (kind === "post") {
    if (points >= 100) return 2.0;
    if (points >= 50)  return 1.7;
    if (points >= 25)  return 1.4;
    if (points >= 10)  return 1.2;
    return 1.0;
  }
  // comment
  if (points >= 30) return 2.6;
  if (points >= 15) return 2.0;
  if (points >= 8)  return 1.5;
  if (points >= 3)  return 1.0;
  return 0.7;
}

function communityFromTags(tags = [], points = 0) {
  const set = new Set(tags);
  if (set.has("show_hn"))   return "hn:show";
  if (set.has("ask_hn"))    return "hn:ask";
  if (set.has("front_page")) return "hn:front_page";
  if (points >= 50)         return "hn:high_points";
  return "hn:all";
}

async function fetchAlgolia(path, params) {
  const url = new URL(`${ALGOLIA_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HN Algolia ${res.status}: ${url.toString()}`);
  return res.json();
}

function normalizeStory(hit, contextId, query) {
  const tags = hit._tags || [];
  const points = hit.points || 0;
  const numComments = hit.num_comments || 0;
  const id = `hn:story:${hit.objectID}`;
  const url = `https://news.ycombinator.com/item?id=${hit.objectID}`;
  const community = communityFromTags(tags, points);
  return {
    id,
    context_id: contextId,
    source_id: "hackernews",
    source_kind: "post",
    source_layer: "conversation",
    source_item_id: `hn_t3_${hit.objectID}`,
    url,
    title: hit.title || "",
    body: hit.story_text || hit.title || "",
    author_ref: `hn:${hit.author}`,
    community,
    observed_at: new Date().toISOString(),
    published_at: new Date(hit.created_at_i * 1000).toISOString(),
    metrics: JSON.stringify({ points, comments: numComments, source: "hackernews" }),
    topics: JSON.stringify([query]),
    raw_ref: JSON.stringify({ algolia_objectID: hit.objectID, _tags: tags }),
    content_hash: null,
    intent: null,
    awareness_level: null,
    evidence_weight: calibrateWeight("post", points, numComments),
    quality_score: null,
    sentiment: null,
    evidence_state: null,
  };
}

function normalizeComment(hit, contextId, query) {
  const points = hit.points || 0;
  const id = `hn:comment:${hit.objectID}`;
  const storyId = hit.story_id || hit.parent_id;
  const url = `https://news.ycombinator.com/item?id=${hit.objectID}`;
  const community = "hn:comments";
  return {
    id,
    context_id: contextId,
    source_id: "hackernews",
    source_kind: "comment",
    source_layer: "conversation",
    source_item_id: `hn_t1_${hit.objectID}`,
    url,
    title: hit.story_title || "",
    body: hit.comment_text || "",
    author_ref: `hn:${hit.author}`,
    community,
    observed_at: new Date().toISOString(),
    published_at: new Date(hit.created_at_i * 1000).toISOString(),
    metrics: JSON.stringify({ points, story_id: storyId, source: "hackernews" }),
    topics: JSON.stringify([query]),
    raw_ref: JSON.stringify({ algolia_objectID: hit.objectID, parent_id: hit.parent_id }),
    content_hash: null,
    intent: null,
    awareness_level: null,
    evidence_weight: calibrateWeight("comment", points),
    quality_score: null,
    sentiment: null,
    evidence_state: null,
  };
}

/**
 * Search HN for a query.
 * @returns {Promise<Array>} normalized evidence packets
 */
export async function searchHN(query, opts = {}) {
  const {
    contextId,
    hitsPerPage = DEFAULT_HITS,
    afterDate = null,
    beforeDate = null,
    includeComments = true,
    includeStories = true,
  } = opts;

  if (!contextId) throw new Error("contextId required");

  const tags = [];
  if (includeStories)  tags.push("story");
  if (includeComments) tags.push("comment");
  const tagFilter = `(${tags.join(",")})`;

  const numericFilters = [];
  if (afterDate)  numericFilters.push(`created_at_i>${Math.floor(new Date(afterDate).getTime() / 1000)}`);
  if (beforeDate) numericFilters.push(`created_at_i<${Math.floor(new Date(beforeDate).getTime() / 1000)}`);

  const params = {
    query,
    tags: tagFilter,
    hitsPerPage,
  };
  if (numericFilters.length) params.numericFilters = numericFilters.join(",");

  const json = await fetchAlgolia("search", params);
  const hits = json.hits || [];

  const packets = [];
  for (const hit of hits) {
    const isStory = (hit._tags || []).includes("story");
    if (isStory && includeStories) {
      packets.push(normalizeStory(hit, contextId, query));
    } else if (!isStory && includeComments) {
      packets.push(normalizeComment(hit, contextId, query));
    }
  }
  await sleep(DELAY_MS);
  return packets;
}

/**
 * Producer interface — search mode.
 */
export const hackernews = {
  id: "hackernews",
  layer: "conversation",
  kind: "search",
  async search({ contextId, queries, ...opts }) {
    const results = [];
    for (const q of queries) {
      try {
        const packets = await searchHN(q, { contextId, ...opts });
        results.push(...packets);
      } catch (err) {
        console.error(`[hackernews] query "${q}" failed:`, err.message);
      }
    }
    return results;
  },
};
