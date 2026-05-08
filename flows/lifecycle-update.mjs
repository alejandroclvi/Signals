/**
 * Lifecycle-update workflow.
 *
 * Refresh graph + lens scores, then run lifecycle classification across all
 * signals in the context. Writes signal_lifecycle + appends signal_lifecycle_snapshots.
 *
 * The snapshots table is the timeline — each run adds one row per signal —
 * so over time you can see "this signal was forming on 2026-04-21, materialized by 2026-05-07".
 *
 * Usage:
 *   pnpm flow run lifecycle-update --context <ctx> [--asOf YYYY-MM-DD]
 */

export default {
  name: "lifecycle-update",
  description: "Classify lifecycle state for every signal in a context; append a timeline snapshot",

  inputs: {
    context: { required: true },
    asOf:    { default: () => new Date().toISOString().slice(0, 10) },
  },

  steps: [
    { name: "graph-sync", bash: "pnpm graph:sync ${context}" },
    { name: "score",      js: "src/flows/steps/score-all.mjs", args: { context: "${context}" } },
    {
      name: "lifecycle",
      js: "src/flows/steps/lifecycle-update.mjs",
      args: { context: "${context}", asOf: "${asOf}" },
      capture: "lifecycle_report",
    },
  ],
};
