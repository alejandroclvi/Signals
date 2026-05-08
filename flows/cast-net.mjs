/**
 * Cast-net research workflow.
 *
 * For each at-risk signal (forming/stalled/emerging) in the context, generates
 * diverse query variants via LLM, runs them across producers, and recomputes
 * lifecycle to identify what materialized vs what stayed stalled.
 *
 * Output is a report — which signals materialized (forming/stalled → fresh),
 * which moved up (forming → emerging), which stayed stuck.
 *
 * Usage:
 *   pnpm flow run cast-net --context <ctx> [--atRiskStates forming,stalled] [--producers hackernews]
 */

export default {
  name: "cast-net",
  description: "Research workflow: discover evidence for at-risk (forming/stalled) signals; recompute lifecycle to label outcomes",

  inputs: {
    context:           { required: true },
    asOf:              { default: () => new Date().toISOString().slice(0, 10) },
    atRiskStates:      { default: "forming,stalled,emerging" },
    variantsPerSignal: { default: 4 },
    perVariantLimit:   { default: 10 },
    producers:         { default: "hackernews" },
    signalLimit:       { default: 3 },
  },

  steps: [
    {
      name: "lifecycle-before",
      js: "src/flows/steps/lifecycle-update.mjs",
      args: { context: "${context}", asOf: "${asOf}" },
      capture: "before_report",
    },
    {
      name: "cast-net",
      js: "src/flows/steps/cast-net.mjs",
      args: {
        context: "${context}",
        asOf: "${asOf}",
        atRiskStates: "${atRiskStates}",
        variantsPerSignal: "${variantsPerSignal}",
        perVariantLimit: "${perVariantLimit}",
        producers: "${producers}",
        signalLimit: "${signalLimit}",
      },
      capture: "cast_report",
    },
    {
      name: "link-evidence",
      js: "src/flows/steps/link-evidence.mjs",
      args: { context: "${context}" },
      capture: "link_report",
    },
    { name: "graph-sync", bash: "pnpm graph:sync ${context}" },
    {
      name: "lifecycle-after",
      js: "src/flows/steps/lifecycle-update.mjs",
      args: { context: "${context}", asOf: "${asOf}" },
      capture: "after_report",
    },
  ],
};
