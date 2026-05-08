/**
 * LinkedIn Pulse ingest workflow.
 *
 * 1. Discover trending LinkedIn Pulse articles via DDG (linkedin-pulse-radar)
 * 2. Classify each by hook archetype (classify-hook-quality)
 * 3. Ingest classified articles into evidence_packets corpus
 * 4. Compute archetype distribution for the context
 * 5. Save markdown report with recommended target archetype
 *
 * Uses existing context as the corpus owner — articles attach to that context's
 * evidence pool. Subsequent runs add more articles; idempotent via source_item_id.
 *
 * Examples:
 *   pnpm flow run linkedin-pulse-ingest \
 *     --context claude-code-knowledge-gap \
 *     --topic "AI coding tools" \
 *     --minScore 50
 *
 *   pnpm flow run linkedin-pulse-ingest \
 *     --context ai-agents-replacing-saas-founders-and-te \
 *     --topic "AI agents" \
 *     --minScore 60
 */

export default {
  name: "linkedin-pulse-ingest",
  description: "Discover LinkedIn Pulse articles, classify, ingest into corpus, compute archetype distribution",

  inputs: {
    context:  { required: true },
    topic:    { default: "" },
    queries:  { default: "" },
    perQuery: { default: 10 },
    minScore: { default: 50 },
    max:      { default: 25 },
    asOf:     { default: () => new Date().toISOString().slice(0, 10) },
  },

  steps: [
    {
      name: "discover",
      js: "src/flows/steps/discover-linkedin-pulse.mjs",
      args: { topic: "${topic}", queries: "${queries}", perQuery: "${perQuery}" },
      capture: "discovery",
    },
    {
      name: "classify",
      js: "src/flows/steps/classify-hook-quality.mjs",
      args: {
        hooks: "${discovery.articles}",
        minScore: "${minScore}",
        max: "${max}",
      },
      capture: "verdicts",
    },
    {
      name: "ingest",
      js: "src/flows/steps/ingest-linkedin-articles.mjs",
      args: {
        context: "${context}",
        articles: "${verdicts.classified}",
        defaultDate: "${asOf}",
      },
      capture: "ingest_summary",
    },
    {
      name: "distribution",
      js: "src/flows/steps/archetype-distribution.mjs",
      args: { context: "${context}", windowDays: 120 },
      capture: "dist",
    },
    {
      name: "save",
      js: "src/flows/steps/save-archetype-report.mjs",
      args: {
        distribution: "${dist}",
        context: "${context}",
        topic: "${topic}",
        ingestSummary: "${ingest_summary}",
        asOf: "${asOf}",
      },
      capture: "report_path",
    },
  ],
};
