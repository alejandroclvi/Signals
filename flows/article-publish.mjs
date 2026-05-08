/**
 * Article-publish workflow (lifecycle-aware).
 *
 * Anchors articles on signals in specific lifecycle states. Defaults to
 * fresh + mature — material that's actively happening or sustained.
 *
 * Lifecycle states:
 *   fresh     — strong recent emergence (PRIMARY article material)
 *   emerging  — growing, still proving (use as "what to watch")
 *   mature    — sustained background (use for context)
 *   fading    — was hot, declining (good for "the wave is breaking" articles)
 *   forming   — fragile, sparse (do not anchor on these)
 *   stalled   — needs cast-net research (article should NOT use these)
 *   dormant   — dead (article should NOT use these)
 *
 * Inputs:
 *   --context           required
 *   --lens              default content
 *   --asOf              default today
 *   --lifecycleStates   comma-separated; default: fresh,mature
 *   --windowDays        quote freshness window (default 30)
 *   --audience          who the article is for
 */

export default {
  name: "article-publish",
  description: "Lifecycle-aware long-form LinkedIn article (anchored on fresh/mature signals)",

  inputs: {
    context:          { required: true },
    lens:             { default: "content" },
    asOf:             { default: () => new Date().toISOString().slice(0, 10) },
    lifecycleStates:  { default: "fresh,mature" },
    windowDays:       { default: 30 },
    audience:         { default: "solo founders and engineers shipping AI-augmented products" },
    topN:             { default: 4 },
    quotesPerSignal:  { default: 3 },
    targetWords:      { default: 750 },
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
      file: { path: "output/articles/${asOf}-${context}-${lens}-lifecycle.md", content: "${article_text}" },
    },
  ],
};
