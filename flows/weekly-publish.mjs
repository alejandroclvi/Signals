/**
 * Weekly publish workflow.
 *
 * Refreshes the graph, rescores all lenses, generates the weekly brief,
 * extracts the top lens-specific signals, drafts a LinkedIn post and an
 * Instagram caption via LLM, and writes both as files for manual review/posting.
 */

export default {
  name: "weekly-publish",
  description: "Refresh → rescore → brief → draft LinkedIn + IG from top signals",

  inputs: {
    context: { required: true },
    lens:    { default: "content" },
    asOf:    { default: () => new Date().toISOString().slice(0, 10) },
    style:   { default: "punchy" },
  },

  steps: [
    {
      name: "graph-sync",
      bash: "pnpm graph:sync ${context}",
      silent: false,
    },
    {
      name: "score-all-lenses",
      js: "src/flows/steps/score-all.mjs",
      args: { context: "${context}" },
      capture: "score_summary",
    },
    {
      name: "weekly-brief",
      bash: "pnpm report:weekly --asOf ${asOf} --out output/${context}-${asOf}.md",
      silent: false,
    },
    {
      name: "extract-top",
      js: "src/flows/steps/extract-top.mjs",
      args: { context: "${context}", lens: "${lens}", limit: 5 },
      capture: "top_signals",
    },
    {
      name: "linkedin-draft",
      js: "src/flows/steps/linkedin-draft.mjs",
      args: { signals: "${top_signals}", style: "${style}" },
      capture: "linkedin_text",
    },
    {
      name: "save-linkedin",
      file: { path: "output/drafts/${asOf}-${context}-linkedin.md", content: "${linkedin_text}" },
    },
    {
      name: "ig-caption",
      js: "src/flows/steps/ig-caption.mjs",
      args: { signals: "${top_signals}" },
      capture: "ig_text",
    },
    {
      name: "save-ig",
      file: { path: "output/drafts/${asOf}-${context}-ig.md", content: "${ig_text}" },
    },
  ],
};
