/**
 * Graph-derived score components.
 *
 * Reads the Neo4j projection of the evidence graph to compute three components
 * the SQLite-only scorer cannot compute:
 *   - Velocity:       z-score of recent daily evidence vs baseline window
 *   - Corroboration:  unique sources × layers backing the signal
 *   - Independence:   1 - top_community_share (concentration penalty)
 *
 * If the graph is unreachable, returns zeros so the legacy scorer still works.
 */

import { isGraphConfigured } from "../graph/client.mjs";
import { signalVelocity, signalCorroboration, signalCorroborationByTheme, communitySpread } from "../graph/insights.mjs";

export const DEFAULT_GRAPH_WEIGHTS = {
  velocity:      40,  // points per 1.0 z-score, capped at 100
  corroboration: 60,  // 60 per layer beyond the first, capped at 100
  independence:  60,  // 0..60 by 1 - top_community_share
};

export async function graphScoreComponents(signalId, options = {}) {
  if (!isGraphConfigured()) return { components: [], skipped: "graph-not-configured" };

  const weights = { ...DEFAULT_GRAPH_WEIGHTS, ...(options.weights || {}) };
  const asOf = options.asOf || null;

  let velocity, corroboration, spread, themeCorroboration;
  try {
    [velocity, corroboration, spread, themeCorroboration] = await Promise.all([
      signalVelocity(signalId, { asOf }),
      signalCorroboration(signalId),
      communitySpread(signalId),
      signalCorroborationByTheme(signalId),
    ]);
  } catch (err) {
    return { components: [], skipped: `graph-error: ${err.message}` };
  }

  const velocityScore = Math.max(0, Math.min(100, Math.round((velocity.zScore || 0) * weights.velocity)));

  // Use the richer (theme-based) corroboration when it exceeds direct SUPPORTS-based.
  // This captures HN/Polymarket evidence not yet linked to signals via signal extraction.
  const layers     = Math.max(corroboration.layers || 0,  themeCorroboration.layers || 0);
  const sources    = Math.max(corroboration.sources || 0, themeCorroboration.sources || 0);
  const sourceIds  = themeCorroboration.sourceIds || [];
  const corroborationScore = Math.min(100, (Math.max(0, layers - 1) * weights.corroboration) + Math.max(0, sources - 1) * 20);

  const independenceScore = Math.round((1 - (spread.topShare ?? 1)) * weights.independence);

  return {
    components: [
      ["Velocity (z-score)", velocityScore, { recentAvg: velocity.recentAvg, baselineAvg: velocity.baselineAvg, zScore: velocity.zScore, pctChange: velocity.pctChange }],
      ["Corroboration (layers × sources)", corroborationScore, { layers, sources, sourceIds, communities: spread.communities, themeEvidence: themeCorroboration.evidence }],
      ["Independence (community spread)", independenceScore, { topShare: spread.topShare, dominantCommunity: spread.dominantCommunity }],
    ],
    raw: { velocity, corroboration, themeCorroboration, spread },
  };
}
