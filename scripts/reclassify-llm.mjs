#!/usr/bin/env node
/**
 * Reclassify all evidence packets for a context using the LLM micro-classifier.
 *
 * Usage: pnpm reclassify <context-id>
 */

import { reclassifyContext } from "../src/pipeline/llm-classifier.mjs";
import { refreshSignals } from "../src/pipeline/refresh-signals.mjs";

const contextId = process.argv[2];
if (!contextId) {
  console.error("Usage: pnpm reclassify <context-id>");
  process.exit(1);
}

console.log(`Reclassifying evidence for context: ${contextId}`);
const { updated } = await reclassifyContext(contextId);
console.log(`Reclassified ${updated} packets.`);

console.log("Refreshing signals...");
const result = refreshSignals(contextId);
console.log(`Done. ${result.signalCount} signals, ${result.facetCount} facets, ${result.vocabCount} vocabulary entries.`);
