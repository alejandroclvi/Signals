/**
 * Workflow step: incrementally link previously-unlinked evidence to existing
 * signals via keyword overlap. Preserves existing links.
 *
 * Args: { context, minMatches?=2, minCoverage?=0.5, excludeSources?=['polymarket'] }
 * Returns: link report with sample matches for traceability
 */

import "../../lib/env.mjs";
import { linkUnlinkedEvidence } from "../../pipeline/incremental-linker.mjs";

export default async function linkEvidence({ context, minMatches = 2, minCoverage = 0.5, excludeSources = ["polymarket"] } = {}) {
  if (!context) throw new Error("context is required");
  const sources = Array.isArray(excludeSources)
    ? excludeSources
    : typeof excludeSources === "string" ? excludeSources.split(",").map(s => s.trim()) : [];
  return linkUnlinkedEvidence(context, {
    minMatches: typeof minMatches === "string" ? parseInt(minMatches, 10) : minMatches,
    minCoverage: typeof minCoverage === "string" ? parseFloat(minCoverage) : minCoverage,
    excludeSources: sources,
  });
}
