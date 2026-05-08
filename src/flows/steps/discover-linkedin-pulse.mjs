/**
 * Discover trending LinkedIn Pulse articles via search-engine queries scoped
 * with `site:linkedin.com/pulse`. Uses DuckDuckGo's HTML interface (no auth)
 * which respects the `site:` operator and is more scraper-friendly than Google.
 *
 * NOTE: This is a public-search proxy, NOT LinkedIn API access. We get titles,
 * URLs, and snippets — not engagement counts. To rank by archetype + niche
 * relevance, classify downstream with classify-hook-quality.mjs.
 *
 * Args: { topic?, queries?, perQuery?=10, includeYears? }
 *   - If `queries` (pipe-separated) provided, uses those literal queries
 *   - Else builds queries from `topic` × archetype templates
 * Returns: { articles: [{ title, url, snippet, query, source }], totalQueries }
 */

const DDG_HTML = "https://html.duckduckgo.com/html/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 SignalsLinkedInPulse/0.1";

const ARCHETYPE_TEMPLATES = [
  // Personal experiment
  '"I tested" "{topic}"',
  '"I spent" weeks "{topic}"',
  '"I built" "{topic}"',
  // Comparison
  '"{topic}" "vs" "honest comparison"',
  '"{topic}" "real world take"',
  // Future/death framing
  '"is dead" "{topic}"',
  '"future of" "{topic}"',
  // Numbers
  '"lessons" "{topic}" 2026',
];

function buildQueriesFromTopic(topic) {
  if (!topic) return [];
  return ARCHETYPE_TEMPLATES.map(t => `site:linkedin.com/pulse ${t.replace("{topic}", topic)}`);
}

function decodeDdgRedirect(href) {
  if (!href) return null;
  // DDG wraps results in /l/?uddg=<encoded>
  const m = href.match(/uddg=([^&]+)/);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return null; }
  }
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return "https:" + href;
  return null;
}

function parseDdgHtml(html) {
  // Match the result anchor + snippet pattern. Defensive — DDG markup
  // changes; we strip down to the essentials.
  const results = [];
  // Each .result__a anchor + adjacent .result__snippet
  const anchorRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  const titles = [];
  while ((m = anchorRe.exec(html)) !== null) {
    const url = decodeDdgRedirect(m[1]);
    const title = m[2].replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
    if (url && title) titles.push({ url, title });
  }
  // Snippets in source order, paired by index
  const snippets = [];
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(m[1].replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim());
  }
  for (let i = 0; i < titles.length; i++) {
    results.push({ ...titles[i], snippet: snippets[i] || "" });
  }
  return results;
}

async function ddgSearch(query) {
  const params = new URLSearchParams({ q: query });
  const url = `${DDG_HTML}?${params.toString()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
    },
    body: params.toString(),
  });
  if (!res.ok) return [];
  const html = await res.text();
  return parseDdgHtml(html);
}

function isLinkedInPulse(url) {
  return /linkedin\.com\/pulse\//i.test(url);
}

export default async function discoverLinkedInPulse({
  topic = "",
  queries = "",
  perQuery = 10,
  delayMs = 1500,
} = {}) {
  let queryList;
  if (queries) {
    queryList = String(queries).split("|").map(q => q.trim()).filter(Boolean);
  } else {
    queryList = buildQueriesFromTopic(topic);
    if (!queryList.length) {
      // No topic, no queries — fall back to a generic LinkedIn-Pulse trending sweep
      queryList = [
        'site:linkedin.com/pulse "I tested" 2026',
        'site:linkedin.com/pulse "vs" "honest comparison"',
        'site:linkedin.com/pulse "is dead" 2026',
      ];
    }
  }

  const articles = [];
  const seen = new Set();
  for (const q of queryList) {
    let results;
    try {
      results = await ddgSearch(q);
    } catch {
      results = [];
    }
    let added = 0;
    for (const r of results) {
      if (added >= perQuery) break;
      if (!isLinkedInPulse(r.url)) continue;
      // Strip URL params + canonicalize
      const canonical = r.url.split("?")[0].replace(/\/$/, "");
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      articles.push({
        title: r.title,
        url: canonical,
        snippet: r.snippet,
        query: q,
        source: "linkedin_pulse",
        community: "linkedin:pulse",
        upvotes: 0,
        comments: 0,
        date: "",
      });
      added++;
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  return { articles, totalQueries: queryList.length };
}
