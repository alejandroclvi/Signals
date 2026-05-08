/**
 * Re-score a context across all lenses (writes to signal_scores).
 * Wrapper around lens-scorer for use as a workflow step.
 */

import { scoreContextAllLenses } from "../../pipeline/lens-scorer.mjs";

export default async function scoreAll({ context }) {
  if (!context) throw new Error("context is required");
  const summary = await scoreContextAllLenses(context);
  return { signals: summary.length, lenses: Object.keys(summary[0]?.scores || {}).length };
}
