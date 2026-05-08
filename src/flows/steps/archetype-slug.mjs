/**
 * Tiny helper: turn the targetArchetype into a filename-safe slug.
 * Returns 'default' when no archetype is set.
 */

export default async function archetypeSlug({ archetype = "" } = {}) {
  if (!archetype || typeof archetype !== "string") return "default";
  const cleaned = archetype.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "default";
}
