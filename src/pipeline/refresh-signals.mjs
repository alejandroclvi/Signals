/**
 * Refresh Signals — re-runs signal extraction and scoring using current DB state.
 *
 * This is the missing link between thread intelligence and signal scores.
 * After thread-intel populates thread_intelligence and sets thread_ids on
 * evidence_packets, this function re-extracts signals so they pick up:
 *   - LLM-found extractions (not_x_its_y, failed_solutions)
 *   - Updated confidence tiers
 *   - Thread intelligence scoring component
 *
 * Call this after running thread intelligence to propagate LLM findings
 * into signal scores and rankings.
 */

import { getDb } from "../db/connection.mjs";
import { extractSignals } from "./signal-extractor.mjs";
import { scoreSignal, confidenceFromScore } from "./scorer.mjs";
import { computeSignalConfidenceTier } from "./thread-reconciler.mjs";
import { synthesizeFacets } from "./facet-synthesizer.mjs";
import { synthesizeVocabulary } from "./vocabulary-extractor.mjs";
import { refreshSupportCounts } from "./intelligence-chain.mjs";
import { rebuildCases } from "./signal-cases.mjs";
import crypto from "node:crypto";

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Re-extract and re-score signals for a context.
 * Preserves human decisions (saved, dismissed, alerted).
 */
export function refreshSignals(contextId) {
  const db = getDb();

  // Load all evidence for this context
  const packets = db.prepare(
    `SELECT * FROM evidence_packets WHERE context_id = ?`
  ).all(contextId);

  if (packets.length === 0) return { signalCount: 0, updated: 0 };

  // Re-extract signals (now with thread_ids set, LLM extractions will merge)
  const { signals, signalEvidence } = extractSignals(packets, contextId);

  // Load existing human decisions to preserve
  const existingSignals = new Map();
  const existing = db.prepare(
    `SELECT id, saved, dismissed, alerted FROM signals WHERE context_id = ?`
  ).all(contextId);
  for (const s of existing) {
    existingSignals.set(s.id, s);
  }

  // Re-score each signal
  const upsertSignal = db.prepare(`
    INSERT OR REPLACE INTO signals
    (id, context_id, rank, status, title, growth, tags, summary, communities,
     mentions, comments, confidence, volume, why, suggested_title, suggested_sub, next_source,
     dominant_intent, intent_mix, sentiment_distribution, dominant_sentiment,
     state_distribution, dominant_state,
     awareness_distribution, dominant_awareness,
     desire_type, top_extractions, failed_solutions,
     bubble_x, bubble_y, bubble_r, saved, dismissed, alerted, confidence_tier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const upsertEvidence = db.prepare(
    `INSERT OR IGNORE INTO signal_evidence (signal_id, evidence_id) VALUES (?, ?)`
  );

  const upsertScore = db.prepare(
    `INSERT OR REPLACE INTO scoring_runs (id, signal_id, run_at, components, total) VALUES (?, ?, datetime('now'), ?, ?)`
  );

  let updated = 0;

  const refresh = db.transaction(() => {
    // Clear old signal_evidence for this context (will be re-inserted)
    const signalIds = existing.map(s => s.id);
    if (signalIds.length > 0) {
      db.prepare(`DELETE FROM signal_evidence WHERE signal_id IN (${signalIds.map(() => "?").join(",")})`).run(...signalIds);
    }

    // Remove stale signals whose IDs no longer match (theme label changes can cause ID changes)
    const newSignalIds = new Set(signals.map(s => s.id));
    const staleIds = signalIds.filter(id => !newSignalIds.has(id));
    if (staleIds.length > 0) {
      db.prepare(`DELETE FROM signals WHERE id IN (${staleIds.map(() => "?").join(",")})`).run(...staleIds);
    }

    for (const signal of signals) {
      const evidenceIds = signalEvidence.get(signal.id) || [];
      const signalPackets = packets.filter(p => evidenceIds.includes(p.id));

      // Score
      const { components, total } = scoreSignal(signal, signalPackets);
      const confidence = confidenceFromScore(total);

      // Compute confidence tier from thread intelligence
      const tier = computeSignalConfidenceTier(signal.id);

      // Preserve human decisions
      const prev = existingSignals.get(signal.id);
      const saved = prev?.saved || 0;
      const dismissed = prev?.dismissed || 0;
      const alerted = prev?.alerted || 0;

      // Re-rank by score
      signal.rank = signals.indexOf(signal) + 1;

      upsertSignal.run(
        signal.id, contextId, signal.rank, signal.status,
        signal.title, signal.growth, signal.tags, signal.summary, signal.communities,
        signal.mentions, signal.comments, confidence, signal.volume, signal.why,
        signal.suggested_title, signal.suggested_sub, signal.next_source,
        signal.dominant_intent, signal.intent_mix,
        signal.sentiment_distribution || "{}",
        signal.dominant_sentiment || "neutral",
        signal.state_distribution || "{}",
        signal.dominant_state || "sharing_insight",
        signal.awareness_distribution, signal.dominant_awareness,
        signal.desire_type, signal.top_extractions, signal.failed_solutions,
        signal.bubble_x, signal.bubble_y, signal.bubble_r,
        saved, dismissed, alerted, tier
      );

      // Store scoring run
      upsertScore.run(crypto.randomUUID(), signal.id, JSON.stringify(components), total);

      // Re-link evidence
      for (const eid of evidenceIds) {
        upsertEvidence.run(signal.id, eid);
      }

      updated++;
    }
  });

  refresh();

  // Synthesize facets from evidence + thread intelligence
  const facetCount = synthesizeFacets(contextId);

  // Extract vocabulary from evidence
  const vocabCount = synthesizeVocabulary(contextId);

  // Propagate confidence across intelligence chain
  try { refreshSupportCounts(contextId); } catch {}

  // Rebuild cross-community case groupings (memberships get cascaded-deleted
  // when stale signals were removed above — see G-17 in SIGNAL_AGENT_MVP_REPORT).
  let cases = { detected: 0, stored: 0, skippedMembers: 0 };
  try { cases = rebuildCases(contextId); } catch (e) {
    console.error("rebuildCases failed:", e.message);
  }

  return { signalCount: signals.length, updated, facetCount, vocabCount, cases };
}
