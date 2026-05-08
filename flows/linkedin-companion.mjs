/**
 * LinkedIn distribution-companion workflow.
 *
 * For an article (markdown file path), this flow:
 *   1. Extracts audience keywords + descriptor via LLM
 *   2. Runs LinkedIn people-search via the linkedin MCP for each keyword
 *   3. Drafts a personalized 1-2 sentence DM intro per profile
 *   4. Writes output/distribution/<date>-<article>-linkedin-distribution.md
 *
 * NEVER sends DMs automatically. The output is a review checklist.
 *
 * Pre-reqs:
 *   - linkedin MCP registered in ~/.claude.json (first call opens a browser
 *     for Patchright login; cached for subsequent runs at ~/.linkedin-mcp/)
 *
 * Usage:
 *   pnpm flow run linkedin-companion --articlePath output/articles/2026-05-08-foo.md
 */

export default {
  name: "linkedin-companion",
  description: "Turn a published article into a reviewable LinkedIn outbound list — search audience, draft DM intros, save for manual review",

  inputs: {
    articlePath: { required: true },
    location:    { default: "" },
    perKeyword:  { default: 5 },
    asOf:        { default: () => new Date().toISOString().slice(0, 10) },
  },

  steps: [
    {
      name: "extract-keywords",
      js: "src/flows/steps/article-extract-keywords.mjs",
      args: { path: "${articlePath}" },
      capture: "topic",
    },
    {
      name: "linkedin-search",
      js: "src/flows/steps/linkedin-audience-search.mjs",
      args: {
        keywords: "${topic.keywords}",
        location: "${location}",
        perKeyword: "${perKeyword}",
      },
      capture: "search_result",
    },
    {
      name: "draft-dms",
      js: "src/flows/steps/linkedin-dm-drafts.mjs",
      args: {
        profiles: "${search_result.profiles}",
        articlePath: "${articlePath}",
        audience_descriptor: "${topic.audience_descriptor}",
        topic_summary: "${topic.topic_summary}",
      },
      capture: "drafts",
    },
    {
      name: "save",
      js: "src/flows/steps/save-distribution-list.mjs",
      args: {
        drafts: "${drafts.drafts}",
        articlePath: "${articlePath}",
        asOf: "${asOf}",
        topic_summary: "${topic.topic_summary}",
        audience_descriptor: "${topic.audience_descriptor}",
      },
      capture: "output_path",
    },
  ],
};
