/**
 * LinkedIn engagement radar.
 *
 * For a topical criteria (free text) OR a corpus signal_id, finds LinkedIn
 * posts on that theme via the linkedin MCP, scores each post against the
 * criteria, opens the top matches as browser tabs, and saves a review brief.
 *
 * Two input modes:
 *   --criteria "founders frustrated with Claude Code costs"
 *   --signalId live:cost-management --context claude-code-knowledge-gap
 *
 * Examples:
 *   pnpm flow run linkedin-engagement-radar \
 *     --signalId live:cost-management --context claude-code-knowledge-gap \
 *     --max 8
 *
 *   pnpm flow run linkedin-engagement-radar \
 *     --criteria "AI coding tool cost management" --noOpenTabs true
 *
 * Pre-reqs:
 *   - linkedin MCP registered in ~/.claude.json + Patchright login complete
 *   - OPENROUTER_API_KEY in .env (used for criteria expansion + post scoring)
 *
 * Notes:
 *   - This flow does NOT post, comment, or DM. Output is a review checklist
 *     plus open browser tabs. All actions remain manual on your side.
 */

export default {
  name: "linkedin-engagement-radar",
  description: "Find LinkedIn posts matching a criteria or corpus signal; open as tabs; save engagement angles for review",

  inputs: {
    criteria:    { default: "" },
    signalId:    { default: "" },
    context:     { default: "" },
    location:    { default: "" },
    perKeyword:  { default: 4 },
    maxScrolls:  { default: 4 },
    max:         { default: 8 },
    minFit:      { default: 60 },
    noOpenTabs:  { default: false },
    asOf:        { default: () => new Date().toISOString().slice(0, 10) },
  },

  steps: [
    {
      name: "resolve-criteria",
      js: "src/flows/steps/resolve-criteria.mjs",
      args: { criteria: "${criteria}", signalId: "${signalId}", context: "${context}" },
      capture: "topic",
    },
    {
      name: "find-authors",
      js: "src/flows/steps/linkedin-audience-search.mjs",
      args: { keywords: "${topic.keywords}", location: "${location}", perKeyword: "${perKeyword}" },
      capture: "authors",
    },
    {
      name: "fetch-posts",
      js: "src/flows/steps/linkedin-recent-posts.mjs",
      args: { profiles: "${authors.profiles}", maxScrolls: "${maxScrolls}" },
      capture: "post_pool",
    },
    {
      name: "score-posts",
      js: "src/flows/steps/score-posts-vs-criteria.mjs",
      args: {
        posts: "${post_pool.posts}",
        criteria: "${topic.criteria}",
        topic_summary: "${topic.topic_summary}",
        max: "${max}",
        minFit: "${minFit}",
      },
      capture: "scored",
    },
    {
      name: "save-radar",
      js: "src/flows/steps/save-engagement-radar.mjs",
      args: {
        matches: "${scored.matches}",
        criteria: "${topic.criteria}",
        topic_summary: "${topic.topic_summary}",
        signalRef: "${topic.signal}",
        asOf: "${asOf}",
      },
      capture: "radar_path",
    },
    {
      name: "open-tabs",
      js: "src/flows/steps/open-tabs.mjs",
      args: {
        urls: "${scored.matches}",
        cap: "${max}",
        dryRun: "${noOpenTabs}",
      },
      capture: "tab_result",
    },
  ],
};
