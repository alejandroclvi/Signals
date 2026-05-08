/**
 * Workflow step: LLM-verified incremental linker.
 *
 * Args: { context, acceptVerdicts?='yes', maxCandidatesPerSignal?=24 }
 * Returns: { inserted, signalsConsidered, candidatesConsidered, llmCalls, sample }
 */

import "../../lib/env.mjs";
import { llmVerifyLinks } from "../../pipeline/llm-linker.mjs";

export default async function linkEvidenceLlm({
  context,
  acceptVerdicts = "yes",
  maxCandidatesPerSignal = 24,
} = {}) {
  if (!context) throw new Error("context is required");
  const accept = Array.isArray(acceptVerdicts)
    ? acceptVerdicts
    : typeof acceptVerdicts === "string" ? acceptVerdicts.split(",").map(s => s.trim()) : ["yes"];
  return llmVerifyLinks(context, {
    acceptVerdicts: accept,
    maxCandidatesPerSignal: typeof maxCandidatesPerSignal === "string"
      ? parseInt(maxCandidatesPerSignal, 10) : maxCandidatesPerSignal,
  });
}
