/**
 * Article-generator router.
 *
 * Routes the article-draft step based on targetArchetype:
 *   - pill generator: archetypes that compose with numbered pain/solution lists
 *   - narrative generator: archetypes that need a story arc
 *
 * The router itself is a JS step that calls the right generator function and
 * returns the article text — the workflow stays linear, no conditional steps.
 */

import articlePillDraft from "./article-pill-draft.mjs";
import articleNarrativeDraft from "./article-narrative-draft.mjs";

const PILL_ARCHETYPES = new Set([
  "specific-result",
  "comparison-deep",
  "field-report",
  "post-mortem-list",  // optional: post-mortem with numbered failure modes
]);

const NARRATIVE_ARCHETYPES = new Set([
  "dying-king",
  "geopolitical-bridge",
  "contrarian-insider",
  "origin-story",
  "underdog-winning",
  "post-mortem",
]);

function pickGenerator(targetArchetype) {
  if (!targetArchetype) return "pill";  // default
  const a = String(targetArchetype).toLowerCase();
  if (NARRATIVE_ARCHETYPES.has(a)) return "narrative";
  if (PILL_ARCHETYPES.has(a)) return "pill";
  return "pill";  // safe default
}

export default async function articleRoute(args = {}) {
  const archetype = args.targetArchetype || "";
  const which = pickGenerator(archetype);
  const fn = which === "narrative" ? articleNarrativeDraft : articlePillDraft;
  const text = await fn(args);
  // Wrap with metadata so downstream steps can see which generator ran
  return { text, generator: which, archetype };
}
