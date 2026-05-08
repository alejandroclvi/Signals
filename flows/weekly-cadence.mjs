/**
 * Weekly cadence — single command for the full weekly intelligence loop.
 *
 *   1. Refresh graph from latest evidence
 *   2. Score across all lenses
 *   3. Lifecycle pass #1 — classify every signal's current trajectory state
 *   4. Cast-net — research at-risk (forming/stalled/emerging) signals via LLM-
 *      generated query variants, ingest from Reddit + HN
 *   5. Link new evidence to existing signals (incremental, by keyword overlap)
 *   6. Re-sync graph + re-score (so scores reflect the augmented evidence)
 *   7. Lifecycle pass #2 — capture transitions (this is when materialization fires)
 *   8. Select fresh + mature signals
 *   9. Pull source quotes (per-signal Reddit + HN context evidence + Polymarket)
 *  10. Hook research from top niche posts
 *  11. LLM-generated long-form article anchored on lifecycle states
 *  12. Save to disk
 *
 * Run weekly. Each run accumulates lifecycle history in signal_lifecycle_snapshots
 * — the timeline you build up over time becomes the system's memory.
 *
 * Usage:
 *   pnpm flow run weekly-cadence --context <ctx> [--lens content] [--audience "..."]
 */

export default {
  name: "weekly-cadence",
  description: "Full weekly intelligence loop — refresh, research at-risk signals, classify lifecycle, write article",

  inputs: {
    context:           { required: true },
    lens:              { default: "content" },
    asOf:              { default: () => new Date().toISOString().slice(0, 10) },
    lifecycleStates:   { default: "fresh,mature" },
    atRiskStates:      { default: "forming,stalled,emerging" },
    castProducers:     { default: "hackernews" },
    castSignalLimit:   { default: 3 },
    castVariants:      { default: 4 },
    audience:          { default: "solo founders and engineers shipping AI-augmented products" },
    windowDays:        { default: 30 },
    topN:              { default: 4 },
    quotesPerSignal:   { default: 3 },
    targetWords:       { default: 750 },
  },

  steps: [
    { name: "graph-sync-1",  bash: "pnpm graph:sync ${context}" },
    { name: "score-1",       js: "src/flows/steps/score-all.mjs", args: { context: "${context}" } },
    {
      name: "lifecycle-1",
      js: "src/flows/steps/lifecycle-update.mjs",
      args: { context: "${context}", asOf: "${asOf}" },
      capture: "lifecycle_before",
    },
    {
      name: "cast-net",
      js: "src/flows/steps/cast-net.mjs",
      args: {
        context: "${context}",
        asOf: "${asOf}",
        atRiskStates: "${atRiskStates}",
        producers: "${castProducers}",
        signalLimit: "${castSignalLimit}",
        variantsPerSignal: "${castVariants}",
      },
      capture: "cast_report",
    },
    {
      name: "link-evidence",
      js: "src/flows/steps/link-evidence.mjs",
      args: { context: "${context}" },
      capture: "link_report",
    },
    { name: "graph-sync-2",  bash: "pnpm graph:sync ${context}" },
    { name: "score-2",       js: "src/flows/steps/score-all.mjs", args: { context: "${context}" } },
    {
      name: "lifecycle-2",
      js: "src/flows/steps/lifecycle-update.mjs",
      args: { context: "${context}", asOf: "${asOf}" },
      capture: "lifecycle_after",
    },
    {
      name: "select-by-lifecycle",
      js: "src/flows/steps/extract-by-lifecycle.mjs",
      args: {
        context: "${context}",
        lens: "${lens}",
        states: "${lifecycleStates}",
        limit: "${topN}",
      },
      capture: "fresh_signals",
    },
    {
      name: "extract-quotes",
      js: "src/flows/steps/extract-quotes.mjs",
      args: {
        context: "${context}",
        signalIds: "${fresh_signals}",
        perSignal: "${quotesPerSignal}",
        asOf: "${asOf}",
        windowDays: "${windowDays}",
      },
      capture: "signal_quotes",
    },
    {
      name: "context-evidence",
      js: "src/flows/steps/extract-context-evidence.mjs",
      args: { context: "${context}", asOf: "${asOf}", windowDays: "${windowDays}" },
      capture: "context_evidence",
    },
    {
      name: "hook-research",
      js: "src/flows/steps/hook-research.mjs",
      args: { context: "${context}", limit: 20 },
      capture: "hook_research",
    },
    {
      name: "article-draft",
      js: "src/flows/steps/article-draft.mjs",
      args: {
        signals: "${fresh_signals}",
        quotes: "${signal_quotes}",
        hooks: "${hook_research}",
        contextEvidence: "${context_evidence}",
        context: "${context}",
        audience: "${audience}",
        asOf: "${asOf}",
        windowDays: "${windowDays}",
        targetWords: "${targetWords}",
      },
      capture: "article_text",
    },
    {
      name: "save-article",
      file: { path: "output/articles/${asOf}-${context}-${lens}-cadence.md", content: "${article_text}" },
    },
  ],
};
