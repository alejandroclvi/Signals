/**
 * Hook radar — find LinkedIn-adaptable hooks in broad-interest subreddits + HN.
 *
 * Different from linkedin-engagement-radar (which finds posts to engage with).
 * This finds POSTS WHOSE TITLES are themselves great LinkedIn hooks — patterns
 * to steal for original posts.
 *
 *   pnpm flow run hook-radar [--topic "AI"] [--minScore 75] [--sinceDays 21]
 *   pnpm flow run hook-radar --subs "ClaudeCode,ClaudeAI" --minTitleLen 12
 *
 * Use --minTitleLen 12 for Claude-heavy subs (many thread titles are short).
 *
 * Defaults: scans r/Futurology + r/technology + r/Singularity + r/OpenAI +
 * r/ChatGPT + r/artificial + r/Economics + r/geopolitics + r/business +
 * r/MachineLearning, plus HN — all with hook-pattern queries (no topic
 * required; pass --topic to narrow).
 *
 * Output: output/hook-backlog/<date>-<topic>-hooks.md — markdown table of
 * hooks with archetype + your-version templates.
 */

export default {
  name: "hook-radar",
  description: "Surface LinkedIn-adaptable hooks from broad-interest subs + HN; classify by narrative archetype",

  inputs: {
    topic:         { default: "" },
    subs:          { default: "" },     // optional override (comma-separated)
    patterns:      { default: "" },     // optional override (pipe-separated)
    sinceDays:     { default: 21 },
    perQueryLimit: { default: 6 },
    includeHN:     { default: true },
    minScore:      { default: 70 },
    max:           { default: 12 },
    minTitleLen:   { default: 28 },
    asOf:          { default: () => new Date().toISOString().slice(0, 10) },
  },

  steps: [
    {
      name: "discover",
      js: "src/flows/steps/discover-broad-hooks.mjs",
      args: {
        topic: "${topic}",
        subs: "${subs}",
        patterns: "${patterns}",
        sinceDays: "${sinceDays}",
        perQueryLimit: "${perQueryLimit}",
        includeHN: "${includeHN}",
        minTitleLen: "${minTitleLen}",
      },
      capture: "discovery",
    },
    {
      name: "classify",
      js: "src/flows/steps/classify-hook-quality.mjs",
      args: {
        hooks: "${discovery.hooks}",
        minScore: "${minScore}",
        max: "${max}",
      },
      capture: "verdicts",
    },
    {
      name: "save",
      js: "src/flows/steps/save-hook-backlog.mjs",
      args: {
        filtered: "${verdicts.filtered}",
        classified: "${verdicts.classified}",
        topic: "${topic}",
        totalConsidered: "${discovery.totalQueries}",
        hooksConsidered: "${discovery.hooks.length}",
        asOf: "${asOf}",
      },
      capture: "outpath",
    },
  ],
};
