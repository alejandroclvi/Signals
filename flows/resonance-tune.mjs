/**
 * Resonance tune — score a draft article against codified LinkedIn resonance
 * principles, generate 5 alternative opening hooks, save a markdown report.
 *
 * Inputs:
 *   --articlePath  required — path to a .md draft (e.g. output/articles/...md)
 *   --audience     optional — for sharper scoring
 *   --skipVariants optional — set to true to skip hook generation
 *
 * Output:
 *   output/resonance/<date>-<article-slug>-resonance.md
 *
 * Examples:
 *   pnpm flow run resonance-tune --articlePath output/articles/2026-05-08-foo.md
 *   pnpm flow run resonance-tune --articlePath ... --audience "founders shipping AI tools"
 */

export default {
  name: "resonance-tune",
  description: "Score a LinkedIn draft for engagement resonance + generate alternative opening hooks",

  inputs: {
    articlePath:   { required: true },
    audience:      { default: "" },
    skipVariants:  { default: false },
    asOf:          { default: () => new Date().toISOString().slice(0, 10) },
  },

  steps: [
    {
      name: "score",
      js: "src/flows/steps/score-resonance.mjs",
      args: { path: "${articlePath}", audience: "${audience}" },
      capture: "scoring",
    },
    {
      name: "variants",
      js: "src/flows/steps/generate-hook-variants.mjs",
      args: { path: "${articlePath}", audience: "${audience}" },
      capture: "variant_set",
    },
    {
      name: "save",
      js: "src/flows/steps/save-resonance-report.mjs",
      args: {
        scoring: "${scoring}",
        variants: "${variant_set.variants}",
        articlePath: "${articlePath}",
        asOf: "${asOf}",
      },
      capture: "outpath",
    },
  ],
};
