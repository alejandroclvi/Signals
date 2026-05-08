/**
 * Article-from-pain-pills workflow.
 *
 * Builds a professionally-structured LinkedIn article anchored on PAIN PILLS
 * (specific complaints with URLs) and SOLUTION PILLS (products/tools that
 * address them).
 *
 * Four input types — all optional, mix-and-match:
 *   --painsFile     JSON file of pain pills (else auto-mined from corpus)
 *   --solutionsFile JSON file of solution pills (else auto-mined from Show HN
 *                                                + promoting/found_what_works
 *                                                state in corpus)
 *   --insightsFile  JSON file of user observations (woven into analysis section)
 *   --knowledgeFile JSON file of supporting reading (cited in conclusion)
 *
 * Pill formats — see src/flows/steps/load-pills.mjs
 *
 * Auto-discovery scope:
 *   --context       which corpus context to mine (required)
 *   --signalId      optional — scope pain auto-mining to one signal's evidence
 *   --keywords      optional comma-separated — body-text filter
 *
 * Examples:
 *   # Fully auto: mines pains + solutions from corpus
 *   pnpm flow run article-from-pain-pills --context claude-code-knowledge-gap
 *
 *   # User-provided pains + auto solutions
 *   pnpm flow run article-from-pain-pills \
 *     --context claude-code-knowledge-gap \
 *     --painsFile ~/Downloads/my-pains.json
 *
 *   # Fully user-provided
 *   pnpm flow run article-from-pain-pills \
 *     --context claude-code-knowledge-gap \
 *     --painsFile pains.json --solutionsFile solutions.json \
 *     --insightsFile insights.json --knowledgeFile knowledge.json
 */

export default {
  name: "article-from-pain-pills",
  description: "Pill-structured professional article: pain points (auto-mined or user-provided) + solutions + insights + knowledge",

  inputs: {
    context:        { required: true },
    signalId:       { default: "" },
    keywords:       { default: "" },
    painsFile:      { default: "" },
    solutionsFile:  { default: "" },
    insightsFile:   { default: "" },
    knowledgeFile:  { default: "" },
    audience:       { default: "solo founders, devtools builders, and engineers shipping AI-augmented products" },
    topic:          { default: "" },
    targetWords:    { default: 850 },
    windowDays:     { default: 60 },
    maxPains:       { default: 6 },
    maxSolutions:   { default: 5 },
    useLlmFilter:   { default: false },
    targetArchetype: { default: "" },
    asOf:           { default: () => new Date().toISOString().slice(0, 10) },
  },

  steps: [
    // 1. Load user-provided pills (no-op if path is empty)
    {
      name: "load-user-pains",
      js: "src/flows/steps/load-pills.mjs",
      args: { path: "${painsFile}", kind: "pain" },
      capture: "user_pains",
    },
    {
      name: "load-user-solutions",
      js: "src/flows/steps/load-pills.mjs",
      args: { path: "${solutionsFile}", kind: "solution" },
      capture: "user_solutions",
    },
    {
      name: "load-insights",
      js: "src/flows/steps/load-pills.mjs",
      args: { path: "${insightsFile}", kind: "insight" },
      capture: "insights",
    },
    {
      name: "load-knowledge",
      js: "src/flows/steps/load-pills.mjs",
      args: { path: "${knowledgeFile}", kind: "knowledge" },
      capture: "knowledge",
    },

    // 2. Auto-mine pains from corpus (will be merged with user pains)
    {
      name: "auto-pains",
      js: "src/flows/steps/find-pain-pills.mjs",
      args: {
        context: "${context}",
        signalId: "${signalId}",
        keywords: "${keywords}",
        windowDays: "${windowDays}",
        max: "${maxPains}",
      },
      capture: "auto_pains",
    },

    // 3. Auto-mine solutions
    {
      name: "auto-solutions",
      js: "src/flows/steps/find-solution-pills.mjs",
      args: {
        context: "${context}",
        topic_summary: "${topic}",
        windowDays: "${windowDays}",
        max: "${maxSolutions}",
        useLlmFilter: "${useLlmFilter}",
      },
      capture: "auto_solutions",
    },

    // 4. Merge: user-provided takes precedence; auto-mined fills the rest
    {
      name: "merge-pills",
      js: "src/flows/steps/merge-pills.mjs",
      args: {
        userPains: "${user_pains.pills}",
        autoPains: "${auto_pains.pills}",
        userSolutions: "${user_solutions.pills}",
        autoSolutions: "${auto_solutions.pills}",
        maxPains: "${maxPains}",
        maxSolutions: "${maxSolutions}",
      },
      capture: "merged",
    },

    // 5. Route + compose — router picks pill or narrative generator based on
    //    targetArchetype, returns { text, generator, archetype }
    {
      name: "draft",
      js: "src/flows/steps/article-route.mjs",
      args: {
        topic: "${topic}",
        audience: "${audience}",
        painPills: "${merged.painPills}",
        solutionPills: "${merged.solutionPills}",
        insightPills: "${insights.pills}",
        knowledgePills: "${knowledge.pills}",
        asOf: "${asOf}",
        targetWords: "${targetWords}",
        contextLabel: "${context}",
        targetArchetype: "${targetArchetype}",
      },
      capture: "article",
    },

    // 6. Tag the filename with archetype slug (or "default" if none)
    {
      name: "build-slug",
      js: "src/flows/steps/archetype-slug.mjs",
      args: { archetype: "${targetArchetype}" },
      capture: "slug",
    },

    // 7. Save (archetype-namespaced when targeted; generator-tagged in name)
    {
      name: "save",
      file: {
        path: "output/articles/${asOf}-${context}-${slug}-${article.generator}.md",
        content: "${article.text}",
      },
    },
  ],
};
