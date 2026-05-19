/**
 * Unify Signals — cross-layer topic synthesis flow.
 *
 * Discovers cross-cutting narratives across all 7 layers of a context, gathers
 * evidence per topic, classifies temporal state (early/current/late) from
 * structural signal + LLM judgement, then synthesizes a multi-layer brief.
 *
 * Output:
 *   - rows in unified_signals + unified_signal_evidence
 *   - human-readable markdown at output/unified-<context>-<asOf>.md
 *
 * Run weekly (or any time you want a fresh cross-layer read):
 *   pnpm flow run unify-signals --context claude-code-news-radar
 */

export default {
  name: "unify-signals",
  description: "Cross-layer topic synthesis — early/current/late narratives across all 7 evidence layers",

  inputs: {
    context:         { required: true },
    asOf:            { default: () => new Date().toISOString().slice(0, 10) },
    sinceDate:       { default: () => new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10) },
    maxTopics:       { default: 8 },
    perLayerSample:  { default: 12 },
    perLayerCap:     { default: 15 },
    minTermMatches:  { default: 1 },
  },

  steps: [
    {
      name: "discover-topics",
      js: "src/flows/steps/discover-topics.mjs",
      args: {
        context: "${context}",
        sinceDate: "${sinceDate}",
        maxTopics: "${maxTopics}",
        perLayerSample: "${perLayerSample}",
      },
      capture: "discovery",
    },
    {
      name: "gather-cross-layer",
      js: "src/flows/steps/gather-cross-layer-evidence.mjs",
      args: {
        context: "${context}",
        topics: "${discovery.topics}",
        sinceDate: "${sinceDate}",
        perLayerCap: "${perLayerCap}",
        minTermMatches: "${minTermMatches}",
      },
      capture: "evidence",
    },
    {
      name: "classify-temporal",
      js: "src/flows/steps/classify-temporal.mjs",
      args: { byTopic: "${evidence.byTopic}" },
      capture: "temporal",
    },
    {
      name: "synthesize",
      js: "src/flows/steps/synthesize-topic.mjs",
      args: {
        context: "${context}",
        topics: "${discovery.topics}",
        byTopic: "${evidence.byTopic}",
        temporalById: "${temporal.temporalById}",
      },
      capture: "synth",
    },
    {
      name: "save-brief",
      js: "src/flows/steps/save-unified-brief.mjs",
      args: {
        context: "${context}",
        synthesized: "${synth.synthesized}",
        asOf: "${asOf}",
      },
      capture: "saved",
    },
  ],
};
