/**
 * Anthropic primary-truth producer — Primary Truth layer.
 *
 * Pulls canonical Anthropic announcements so we have ground-truth evidence
 * to compare against community reactions (Reddit/HN/Google). Two sources:
 *
 *   1. GitHub Releases for anthropics/claude-code (and a few related repos).
 *      The release body contains the actual changelog text Anthropic ships.
 *      Stable, clean, version-numbered. Most useful primary signal.
 *
 *   2. anthropic.com/news index — official blog/announcement posts. Heavier
 *      to parse, less structured. Enabled with `includeBlog: true` (off
 *      by default to keep ingest fast and reliable).
 *
 * Each release/post becomes one evidence_packet:
 *   source_id    = "anthropic"
 *   source_layer = "truth"
 *   source_kind  = "release_note" | "blog_post"
 *
 * No auth required (GitHub public releases endpoint = 60/min unauth, plenty).
 * Set GITHUB_TOKEN in .env to raise to 5000/hr if you ingest many repos.
 */

const GITHUB_API = "https://api.github.com";
const DEFAULT_REPOS = [
  "anthropics/claude-code",
  "anthropics/anthropic-sdk-python",
  "anthropics/anthropic-sdk-typescript",
  "anthropics/courses",
];
const DELAY_MS = 800;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ghFetch(path, params = {}) {
  const url = new URL(`${GITHUB_API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "SignalsLocalPoC/0.1" };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${url.toString()}`);
  return res.json();
}

function weightFromRelease(release) {
  // Major versions and recent releases get higher weight. Reactions on the
  // release itself (👍/❤/🚀) sharpen it further.
  const reactions = release.reactions?.total_count || 0;
  const isMajor = /^v?\d+\.\d+\.0$/.test(release.tag_name || "");
  let base = 1.5;
  if (isMajor) base += 0.5;
  if (reactions >= 50) base += 0.5;
  else if (reactions >= 10) base += 0.2;
  // Decay by age
  const days = release.published_at
    ? (Date.now() - new Date(release.published_at).getTime()) / (1000 * 60 * 60 * 24)
    : 999;
  if (days <= 14) base += 0.4;
  else if (days <= 60) base += 0.2;
  return Math.min(2.6, Math.max(0.7, base));
}

function normalizeRelease(release, repo, contextId) {
  const body = (release.body || "").slice(0, 2000);
  return {
    id: `anthropic:release:${repo}:${release.id}`,
    context_id: contextId,
    source_id: "anthropic",
    source_kind: "release_note",
    source_layer: "truth",
    source_item_id: `anth_rel_${release.id}`,
    url: release.html_url,
    title: `${repo} ${release.tag_name}${release.name && release.name !== release.tag_name ? ": " + release.name : ""}`,
    body,
    author_ref: "anthropic:release-bot",
    community: `anthropic:${repo.split("/")[1]}`,
    observed_at: new Date().toISOString(),
    published_at: release.published_at || release.created_at,
    metrics: JSON.stringify({
      tag: release.tag_name,
      prerelease: release.prerelease,
      reactions: release.reactions?.total_count || 0,
      repo,
      source: "anthropic-release",
    }),
    topics: JSON.stringify([repo, release.tag_name]),
    raw_ref: JSON.stringify({ id: release.id, tag: release.tag_name }),
    content_hash: null,
    intent: null,
    awareness_level: null,
    evidence_weight: weightFromRelease(release),
    quality_score: null,
    sentiment: null,
    evidence_state: "primary_truth",
  };
}

async function fetchReleases(repo, { perPage = 30 } = {}) {
  return ghFetch(`/repos/${repo}/releases`, { per_page: perPage });
}

/**
 * Optional blog scrape. Off by default — the GitHub releases path covers
 * 90% of "what shipped" signal and is fully structured.
 */
async function fetchAnthropicNews({ limit = 12 } = {}) {
  // Try the published JSON feed first; fall back to HTML scrape if needed.
  // Anthropic's site uses Next.js with a build-time generated /news index.
  // We grab the HTML and pull <article>/<a> structures heuristically.
  try {
    const res = await fetch("https://www.anthropic.com/news", {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    // Pull anchors that look like news posts (href starts with /news/)
    const items = [];
    const re = /<a[^>]+href="(\/news\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(html)) && items.length < limit) {
      const href = m[1].split("?")[0];
      if (seen.has(href)) continue;
      seen.add(href);
      const inner = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (inner.length < 8) continue;
      items.push({ href: `https://www.anthropic.com${href}`, title: inner });
    }
    return items.slice(0, limit);
  } catch (err) {
    console.error("[anthropic-news] failed:", err.message);
    return [];
  }
}

function normalizeBlogPost(item, contextId) {
  const sid = item.href.replace(/[^a-z0-9]/gi, "-").slice(-32);
  return {
    id: `anthropic:blog:${sid}`,
    context_id: contextId,
    source_id: "anthropic",
    source_kind: "blog_post",
    source_layer: "truth",
    source_item_id: `anth_blog_${sid}`,
    url: item.href,
    title: item.title,
    body: item.title, // Headline-only ingest; full body would require Playwright + per-page fetch
    author_ref: "anthropic:editorial",
    community: "anthropic:news",
    observed_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
    metrics: JSON.stringify({ source: "anthropic-news" }),
    topics: JSON.stringify([]),
    raw_ref: JSON.stringify({ href: item.href }),
    content_hash: null,
    intent: null,
    awareness_level: null,
    evidence_weight: 1.5,
    quality_score: null,
    sentiment: null,
    evidence_state: "primary_truth",
  };
}

/**
 * Producer interface — search mode (queries are accepted but not used for
 * filtering since primary-truth is published broadcast-style; the whole
 * release feed is relevant when the context is an Anthropic-product radar).
 */
export const anthropic = {
  id: "anthropic",
  layer: "truth",
  kind: "search",
  async search({
    contextId,
    repos = null,
    includeBlog = false,
    perRepo = 30,
  } = {}) {
    if (!contextId) throw new Error("contextId required");
    const repoList = repos || DEFAULT_REPOS;
    const results = [];

    for (const repo of repoList) {
      try {
        const releases = await fetchReleases(repo, { perPage: perRepo });
        for (const r of releases) {
          results.push(normalizeRelease(r, repo, contextId));
        }
        await sleep(DELAY_MS);
      } catch (err) {
        console.error(`[anthropic] repo ${repo} failed:`, err.message);
      }
    }

    if (includeBlog) {
      const blog = await fetchAnthropicNews({ limit: 20 });
      for (const item of blog) results.push(normalizeBlogPost(item, contextId));
    }

    return results;
  },
};
