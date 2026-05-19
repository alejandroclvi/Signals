/**
 * GitHub producer — Behavior layer.
 *
 * Behavior signal = people are actually *building* on or *integrating* the
 * thing, not just talking about it. Two evidence kinds:
 *
 *   1. `repo`  — repositories whose name/description/topics match a query.
 *                Stars/forks/recent activity make weight.
 *   2. `issue` — issues + PRs across all of GitHub mentioning the query.
 *                Comment count + reactions make weight.
 *
 * Uses unauthenticated REST search (10 req/min limit, fine for our cadence).
 * Pass GITHUB_TOKEN in .env to get 30 req/min and more reliable rate-limit
 * headroom — same producer code works either way.
 *
 * Each result is normalised to the shared evidence-packet shape so the
 * INSERT OR IGNORE in ingest-multi dedupes naturally on source_item_id.
 */

const API = "https://api.github.com";
const DELAY_MS = 1200; // polite delay between paginated/multi-query calls
const DEFAULT_PER_PAGE = 25;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function calibrateRepoWeight(stars = 0, forks = 0, recentlyActive = false) {
  // Calibrate to the shared 0–2.6 evidence-weight scale.
  const base = Math.log10(Math.max(stars, 0) + 1);          // 0..~4
  const forkBonus = Math.min(0.4, Math.log10(forks + 1) / 5);
  const freshBonus = recentlyActive ? 0.3 : 0;
  return Math.min(2.6, Math.max(0.7, base + forkBonus + freshBonus));
}

function calibrateIssueWeight(comments = 0, reactions = 0, state = "open") {
  let base = 0.7 + Math.log10(Math.max(comments, 0) + 1) * 0.7;
  if (reactions >= 20) base += 0.5;
  else if (reactions >= 5) base += 0.2;
  if (state === "closed") base -= 0.1; // closed = resolved, slightly less hot
  return Math.min(2.6, Math.max(0.6, base));
}

async function ghFetch(path, params) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "SignalsLocalPoC/0.1" };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get("X-RateLimit-Reset");
    const remain = res.headers.get("X-RateLimit-Remaining");
    throw new Error(`GitHub rate-limited (remain=${remain}, reset=${reset}). Set GITHUB_TOKEN in .env to lift to 30/min.`);
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${url.toString()}`);
  return res.json();
}

function isRecentlyActive(pushedAt) {
  if (!pushedAt) return false;
  const days = (Date.now() - new Date(pushedAt).getTime()) / (1000 * 60 * 60 * 24);
  return days <= 30;
}

function normalizeRepo(repo, contextId, query) {
  const stars = repo.stargazers_count || 0;
  const forks = repo.forks_count || 0;
  const recent = isRecentlyActive(repo.pushed_at);
  const community = repo.language
    ? `github:${repo.language.toLowerCase()}`
    : "github:misc";
  return {
    id: `github:repo:${repo.id}`,
    context_id: contextId,
    source_id: "github",
    source_kind: "repo",
    source_layer: "behavior",
    source_item_id: `gh_repo_${repo.id}`,
    url: repo.html_url,
    title: repo.full_name,
    body: [repo.description, repo.topics?.length ? `topics: ${repo.topics.join(", ")}` : ""]
      .filter(Boolean).join("\n").slice(0, 1400),
    author_ref: `github:${repo.owner?.login || "unknown"}`,
    community,
    observed_at: new Date().toISOString(),
    published_at: repo.pushed_at || repo.updated_at || repo.created_at,
    metrics: JSON.stringify({
      stars, forks,
      open_issues: repo.open_issues_count || 0,
      language: repo.language,
      topics: repo.topics || [],
      created_at: repo.created_at,
      pushed_at: repo.pushed_at,
      source: "github",
    }),
    topics: JSON.stringify([query, ...(repo.topics || [])].slice(0, 8)),
    raw_ref: JSON.stringify({ id: repo.id, full_name: repo.full_name }),
    content_hash: null,
    intent: null,
    awareness_level: null,
    evidence_weight: calibrateRepoWeight(stars, forks, recent),
    quality_score: null,
    sentiment: null,
    evidence_state: null,
  };
}

function normalizeIssue(issue, contextId, query) {
  const reactions = issue.reactions?.total_count || 0;
  const comments = issue.comments || 0;
  const isPR = !!issue.pull_request;
  const kind = isPR ? "pr" : "issue";
  const repoFullName = (issue.repository_url || "").replace(`${API}/repos/`, "");
  const community = `github:${kind}`;
  return {
    id: `github:${kind}:${issue.id}`,
    context_id: contextId,
    source_id: "github",
    source_kind: kind,
    source_layer: "behavior",
    source_item_id: `gh_${kind}_${issue.id}`,
    url: issue.html_url,
    title: `${repoFullName}#${issue.number}: ${issue.title}`,
    body: (issue.body || "").slice(0, 1400),
    author_ref: `github:${issue.user?.login || "unknown"}`,
    community,
    observed_at: new Date().toISOString(),
    published_at: issue.updated_at || issue.created_at,
    metrics: JSON.stringify({
      state: issue.state,
      comments, reactions,
      labels: (issue.labels || []).map(l => l.name),
      repo: repoFullName,
      created_at: issue.created_at,
      source: "github",
    }),
    topics: JSON.stringify([query]),
    raw_ref: JSON.stringify({ id: issue.id, repo: repoFullName }),
    content_hash: null,
    intent: null,
    awareness_level: null,
    evidence_weight: calibrateIssueWeight(comments, reactions, issue.state),
    quality_score: null,
    sentiment: null,
    evidence_state: null,
  };
}

async function searchRepos(query, { perPage = DEFAULT_PER_PAGE, sort = "updated" } = {}) {
  const json = await ghFetch("/search/repositories", { q: query, per_page: perPage, sort, order: "desc" });
  return json.items || [];
}

async function searchIssues(query, { perPage = DEFAULT_PER_PAGE, sort = "updated", afterDate } = {}) {
  // Issue search supports `created:>=YYYY-MM-DD` as part of the q string.
  const dateClause = afterDate ? ` created:>=${afterDate}` : "";
  const json = await ghFetch("/search/issues", { q: query + dateClause, per_page: perPage, sort, order: "desc" });
  return json.items || [];
}

/**
 * Producer interface — search mode.
 *
 * For each query, fetch repos + issues. Reactions on issues require the
 * "squirrel-girl" preview header on older API versions but the current
 * default Accept already includes it.
 */
export const github = {
  id: "github",
  layer: "behavior",
  kind: "search",
  async search({ contextId, queries, limit, afterDate, includeRepos = true, includeIssues = true } = {}) {
    if (!contextId) throw new Error("contextId required");
    const perPage = Math.max(5, Math.min(limit ?? DEFAULT_PER_PAGE, 100));
    const results = [];
    for (const q of queries) {
      try {
        if (includeRepos) {
          const repos = await searchRepos(q, { perPage });
          for (const r of repos) results.push(normalizeRepo(r, contextId, q));
          await sleep(DELAY_MS);
        }
        if (includeIssues) {
          const issues = await searchIssues(q, { perPage, afterDate });
          for (const i of issues) results.push(normalizeIssue(i, contextId, q));
          await sleep(DELAY_MS);
        }
      } catch (err) {
        console.error(`[github] query "${q}" failed:`, err.message);
        // Don't break the whole run on a rate-limit hit — most queries may have succeeded.
      }
    }
    return results;
  },
};
