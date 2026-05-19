/**
 * Quote-driven LinkedIn draft — pulls top-weighted POSTS directly from
 * evidence_packets (bypassing the signal-aggregate table) and feeds them
 * into a draft step that can quote, cite engagement numbers, and anchor
 * on a specific editorial angle.
 *
 * Use this when you want a draft that reads like a take, not a dashboard
 * summary. The original `weekly-publish` flow operates on signal aggregates
 * and produces meta-analytical prose; this one operates on raw posts and
 * produces something a human would actually publish.
 *
 * Usage:
 *   pnpm flow run linkedin-from-posts --context claude-code-news-radar \
 *     --style sharp \
 *     --angle "trust betrayal + multi-direction defection from Claude Code" \
 *     --keywords "betray|quota|switch|cancelled|10x less"
 */

export default {
  name: "linkedin-from-posts",
  description: "Quote-driven LinkedIn draft from raw evidence posts (not signal aggregates)",

  inputs: {
    context:     { required: true },
    style:       { default: "sharp" },
    angle:       { default: "" },
    keywords:    { default: "" },
    limit:       { default: 12 },
    targetWords: { default: 280 },
    sinceDate:   { default: () => new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10) },
    asOf:        { default: () => new Date().toISOString().slice(0, 10) },
  },

  steps: [
    {
      name: "extract-top-posts",
      js: "src/flows/steps/extract-top-posts.mjs",
      args: {
        context:   "${context}",
        limit:     "${limit}",
        sinceDate: "${sinceDate}",
        keywords:  "${keywords}",
      },
      capture: "posts",
    },
    {
      name: "linkedin-draft",
      js: "src/flows/steps/linkedin-draft-from-posts.mjs",
      args: {
        posts:       "${posts}",
        style:       "${style}",
        angle:       "${angle}",
        targetWords: "${targetWords}",
      },
      capture: "linkedin_text",
    },
    {
      name: "save-draft",
      file: {
        path:    "output/drafts/${asOf}-${context}-linkedin-from-posts.md",
        content: "${linkedin_text}",
      },
    },
  ],
};
