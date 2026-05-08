/**
 * Link-deep workflow — Phase 2 LLM-verifier pass.
 *
 * Runs the keyword linker first (cheap, catches obvious matches), then the
 * LLM verifier on near-miss candidates (catches semantic matches the keyword
 * pass missed). Re-syncs graph and updates lifecycle so any new transitions
 * surface.
 *
 * Costs ~$0.07 per run via OpenRouter (Gemini Flash). Run periodically when
 * recall matters more than speed.
 *
 *   pnpm flow run link-deep --context <ctx>
 */

export default {
  name: "link-deep",
  description: "Phase 2 LLM-verified linker for high recall",

  inputs: {
    context:                { required: true },
    asOf:                   { default: () => new Date().toISOString().slice(0, 10) },
    acceptVerdicts:         { default: "yes" },
    maxCandidatesPerSignal: { default: 24 },
  },

  steps: [
    {
      name: "link-keyword",
      js: "src/flows/steps/link-evidence.mjs",
      args: { context: "${context}" },
      capture: "keyword_links",
    },
    {
      name: "link-llm",
      js: "src/flows/steps/link-evidence-llm.mjs",
      args: {
        context: "${context}",
        acceptVerdicts: "${acceptVerdicts}",
        maxCandidatesPerSignal: "${maxCandidatesPerSignal}",
      },
      capture: "llm_links",
    },
    { name: "graph-sync", bash: "pnpm graph:sync ${context}" },
    {
      name: "lifecycle-update",
      js: "src/flows/steps/lifecycle-update.mjs",
      args: { context: "${context}", asOf: "${asOf}" },
      capture: "lifecycle_after",
    },
  ],
};
