#!/usr/bin/env node
/**
 * Generate LLM-derived theme labels for a context's research queries.
 *
 * Usage: pnpm theme-labels <context-id>
 */

import { generateThemeLabels } from "../src/pipeline/theme-labeler.mjs";

const contextId = process.argv[2];
if (!contextId) {
  console.error("Usage: pnpm theme-labels <context-id>");
  process.exit(1);
}

console.log(`Generating theme labels for context: ${contextId}`);
const labels = await generateThemeLabels(contextId);

const themes = [...new Set(Object.values(labels))];
console.log(`\n${Object.keys(labels).length} queries → ${themes.length} themes:\n`);
for (const theme of themes) {
  const queries = Object.entries(labels)
    .filter(([, t]) => t === theme)
    .map(([q]) => q);
  console.log(`  ${theme}`);
  for (const q of queries) {
    console.log(`    - ${q}`);
  }
}
