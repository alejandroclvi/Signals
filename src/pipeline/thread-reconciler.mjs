/**
 * Thread Reconciler — compares LLM findings with regex findings.
 *
 * Assigns confidence tiers:
 *   - confirmed: both LLM and regex found the same extraction
 *   - llm_only: LLM found it, regex missed it
 *   - regex_only: regex found it, LLM missed it
 *
 * Logs reconciliation for pattern gap analysis.
 */

import { getDb } from "../db/connection.mjs";
import crypto from "node:crypto";

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Multi-strategy text matching for reconciliation.
 * Returns true if the two texts refer to the same concept.
 *
 * Strategies (any match = confirmed):
 *   1. Entity containment: "Brandwatch" appears in both texts
 *   2. Token Jaccard ≥ 0.2 (lowered from 0.3 — regex fragments are short)
 *   3. Longest common substring ≥ 8 chars (catches partial name matches)
 */
function textsMatch(a, b) {
  if (!a || !b) return false;
  const la = a.toLowerCase();
  const lb = b.toLowerCase();

  // 1. Direct substring containment (either direction)
  if (la.length > 4 && lb.includes(la)) return true;
  if (lb.length > 4 && la.includes(lb)) return true;

  // 2. Extract key entity names (capitalized words, brand names)
  const entitiesA = extractEntities(a);
  const entitiesB = extractEntities(b);
  for (const ea of entitiesA) {
    for (const eb of entitiesB) {
      if (ea === eb) return true;
      if (ea.length > 3 && eb.includes(ea)) return true;
      if (eb.length > 3 && ea.includes(eb)) return true;
    }
  }

  // 3. Token Jaccard (lowered threshold)
  const wordsA = new Set(la.split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(lb.split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size > 0 && wordsB.size > 0) {
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    if (intersection / union >= 0.2) return true;
  }

  return false;
}

/**
 * Extract likely entity/brand names from text.
 * Looks for capitalized words and known patterns.
 */
function extractEntities(text) {
  if (!text) return [];
  const entities = new Set();

  // Capitalized words (likely proper nouns / brand names)
  const caps = text.match(/\b[A-Z][a-zA-Z]{2,}/g) || [];
  for (const c of caps) entities.add(c.toLowerCase());

  // Words before common failure verbs
  const patterns = text.match(/(\w+)(?:\s+(?:before|didn't|wasn't|failed|broke|too expensive|garbage|useless|terrible))/gi) || [];
  for (const p of patterns) {
    const word = p.split(/\s/)[0].toLowerCase();
    if (word.length > 3) entities.add(word);
  }

  return [...entities];
}

/**
 * Reconcile thread intelligence (LLM) with regex extractions for the same thread.
 */
export function reconcileThread(threadId, contextId) {
  const db = getDb();

  // Get thread intelligence
  const intel = db.prepare(
    `SELECT * FROM thread_intelligence WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1`
  ).get(threadId);

  if (!intel) return { tier: "regex_only", reconciliations: [] };

  // Get all evidence packets in this thread
  const packetIds = db.prepare(
    `SELECT evidence_id FROM thread_packets WHERE thread_id = ?`
  ).all(threadId).map(r => r.evidence_id);

  if (packetIds.length === 0) return { tier: "llm_only", reconciliations: [] };

  // Get regex extractions for these packets
  const placeholders = packetIds.map(() => "?").join(",");
  const regexExtractions = db.prepare(
    `SELECT * FROM evidence_extractions WHERE evidence_id IN (${placeholders})`
  ).all(...packetIds);

  // Parse LLM findings
  const llmNotXItsY = safeParseJson(intel.not_x_its_y, []);
  const llmFailed = safeParseJson(intel.failed_solutions, []);
  const llmPain = safeParseJson(intel.pain_language, []);

  // Group regex extractions by type
  const regexByType = {};
  for (const ext of regexExtractions) {
    if (!regexByType[ext.extraction_type]) regexByType[ext.extraction_type] = [];
    regexByType[ext.extraction_type].push(ext);
  }

  const reconciliations = [];
  let hasConfirmed = false;
  let hasLlmOnly = false;
  let hasRegexOnly = false;

  // Reconcile "not_x_its_y"
  for (const llm of llmNotXItsY) {
    const regexMatches = regexByType["not_x_its_y"] || [];
    const llmText = (llm.surface || "") + " " + (llm.deeper || "");
    const match = regexMatches.find(r =>
      textsMatch(r.surface_text + " " + (r.deeper_text || ""), llmText)
    );
    const tier = match ? "confirmed" : "llm_only";
    if (tier === "confirmed") hasConfirmed = true;
    else hasLlmOnly = true;

    reconciliations.push({
      id: crypto.randomUUID(),
      threadId,
      extractionType: "not_x_its_y",
      regexFound: match ? 1 : 0,
      llmFound: 1,
      confidenceTier: tier,
      surfaceText: llm.surface || "",
    });
  }

  // Reconcile "failed_solution"
  for (const llm of llmFailed) {
    const regexMatches = regexByType["failed_solution"] || [];
    const llmText = (llm.name || "") + " " + (llm.reason || "");
    const match = regexMatches.find(r =>
      textsMatch(r.surface_text + " " + (r.deeper_text || ""), llmText) ||
      textsMatch(r.surface_text, llm.name || "")  // entity name match alone
    );
    const tier = match ? "confirmed" : "llm_only";
    if (tier === "confirmed") hasConfirmed = true;
    else hasLlmOnly = true;

    reconciliations.push({
      id: crypto.randomUUID(),
      threadId,
      extractionType: "failed_solution",
      regexFound: match ? 1 : 0,
      llmFound: 1,
      confidenceTier: tier,
      surfaceText: llm.name || "",
    });
  }

  // Check regex extractions that LLM missed
  for (const [type, extractions] of Object.entries(regexByType)) {
    for (const ext of extractions) {
      let llmList;
      if (type === "not_x_its_y") llmList = llmNotXItsY;
      else if (type === "failed_solution") llmList = llmFailed;
      else if (type === "problem_language") llmList = llmPain;
      else continue;

      const extText = (ext.surface_text || "") + " " + (ext.deeper_text || "");
      const llmMatch = llmList.find(l => {
        const llmText = (l.surface || l.quote || l.name || "") + " " + (l.deeper || l.reason || "");
        return textsMatch(extText, llmText);
      });

      if (!llmMatch) {
        hasRegexOnly = true;
        reconciliations.push({
          id: crypto.randomUUID(),
          threadId,
          extractionType: type,
          regexFound: 1,
          llmFound: 0,
          confidenceTier: "regex_only",
          surfaceText: ext.surface_text || "",
        });
      }
    }
  }

  // Determine overall thread confidence tier
  let overallTier;
  if (hasConfirmed) overallTier = "confirmed";
  else if (hasLlmOnly && !hasRegexOnly) overallTier = "llm_only";
  else if (hasRegexOnly && !hasLlmOnly) overallTier = "regex_only";
  else overallTier = "llm_only"; // default if mixed without confirmed

  // Update thread_intelligence confidence_tier
  db.prepare(
    `UPDATE thread_intelligence SET confidence_tier = ? WHERE thread_id = ? AND id = ?`
  ).run(overallTier, threadId, intel.id);

  // Store reconciliation records
  const insert = db.prepare(`
    INSERT OR IGNORE INTO extraction_reconciliation (id, thread_id, extraction_type, regex_found, llm_found, confidence_tier, surface_text)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const r of reconciliations) {
    insert.run(r.id, r.threadId, r.extractionType, r.regexFound, r.llmFound, r.confidenceTier, r.surfaceText);
  }

  return { tier: overallTier, reconciliations };
}

/**
 * Compute aggregate confidence tier for a signal based on its threads.
 */
export function computeSignalConfidenceTier(signalId) {
  const db = getDb();

  // Get threads linked to this signal's evidence
  const tiers = db.prepare(`
    SELECT DISTINCT ti.confidence_tier
    FROM thread_intelligence ti
    JOIN thread_packets tp ON tp.thread_id = ti.thread_id
    JOIN signal_evidence se ON se.evidence_id = tp.evidence_id
    WHERE se.signal_id = ?
  `).all(signalId).map(r => r.confidence_tier).filter(Boolean);

  if (tiers.length === 0) return "regex_only";
  if (tiers.includes("confirmed")) return "confirmed";
  if (tiers.includes("llm_only")) return "llm_only";
  return "regex_only";
}
