/**
 * Workflow step: classify lifecycle for every signal in a context, write
 * signal_lifecycle, append snapshot, return aggregate report.
 *
 * Args: { context, asOf? }
 * Returns: { signals, by_state, transitions, materialized, asOf }
 */

import "../../lib/env.mjs";
import { updateContextLifecycle } from "../../pipeline/signal-lifecycle.mjs";

export default async function lifecycleUpdate({ context, asOf = null } = {}) {
  if (!context) throw new Error("context is required");
  const today = asOf || new Date().toISOString().slice(0, 10);
  const result = updateContextLifecycle(context, today);
  return { ...result, asOf: today };
}
