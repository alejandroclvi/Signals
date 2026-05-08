/**
 * LinkedIn Pulse radar — find trending LinkedIn long-form articles in a niche
 * via `site:linkedin.com/pulse` queries; classify by hook archetype; save a
 * markdown backlog.
 *
 * Different from hook-radar (Reddit/HN broad subs) — this surfaces articles
 * already published on LinkedIn that resonated, so you can study the patterns
 * that work natively on the platform.
 *
 * Inputs:
 *   --topic        topic to search (e.g., "AI coding tools")
 *                   if empty, uses generic trending queries
 *   --queries      pipe-separated explicit queries (overrides topic)
 *                   each prefixed with `site:linkedin.com/pulse`
 *   --minScore     hook-quality threshold (default 65)
 *   --max          max surfaced rows (default 12)
 *
 * NOTE: Search is via DuckDuckGo HTML — fragile, no auth required. For a
 * production-grade signal, swap in a paid Search API (Brave, SerpAPI).
 */

export default {
  name: "linkedin-pulse-radar",
  description: "Discover trending LinkedIn Pulse articles in a niche; classify by archetype; save backlog",

  inputs: {
    topic:    { default: "" },
    queries:  { default: "" },
    perQuery: { default: 10 },
    minScore: { default: 65 },
    max:      { default: 12 },
    asOf:     { default: () => new Date().toISOString().slice(0, 10) },
  },

  steps: [
    {
      name: "discover",
      js: "src/flows/steps/discover-linkedin-pulse.mjs",
      args: {
        topic: "${topic}",
        queries: "${queries}",
        perQuery: "${perQuery}",
      },
      capture: "discovery",
    },
    {
      name: "classify",
      js: "src/flows/steps/classify-hook-quality.mjs",
      args: {
        hooks: "${discovery.articles}",
        minScore: "${minScore}",
        max: "${max}",
      },
      capture: "verdicts",
    },
    {
      name: "save",
      js: "src/flows/steps/save-linkedin-radar.mjs",
      args: {
        filtered: "${verdicts.filtered}",
        classified: "${verdicts.classified}",
        topic: "${topic}",
        totalArticles: "${discovery.articles.length}",
        asOf: "${asOf}",
      },
      capture: "outpath",
    },
  ],
};
