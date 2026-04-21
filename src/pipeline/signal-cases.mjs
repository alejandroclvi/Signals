/**
 * Signal Cases — groups related signals across communities.
 *
 * A "case" represents the same underlying phenomenon appearing in multiple places.
 * Example: "Social listening tools failing" in r/SaaS, r/microsaas, r/smallbusiness
 * = one signal case with three community-level signals as members.
 *
 * Detection strategy:
 *   - Compare thread intelligence across signals
 *   - Signals sharing ≥2 failed solutions → candidate case
 *   - Signals sharing matching not_x_its_y patterns → candidate case
 *   - Similarity on pain_language quotes (Jaccard on key phrases)
 */

import { getDb } from "../db/connection.mjs";
import { createUnit, getCrossThreadIds } from "./intelligence-chain.mjs";
import crypto from "node:crypto";

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function wordTokens(text) {
  return new Set((text || "").toLowerCase().split(/\s+/).filter(w => w.length > 3));
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * Get enriched signal data (intelligence from threads) for all signals in a context.
 */
function getSignalIntelligence(contextId) {
  const db = getDb();

  const signals = db.prepare(
    `SELECT id, title, communities, failed_solutions, top_extractions FROM signals WHERE context_id = ? AND dismissed = 0`
  ).all(contextId);

  // For each signal, get thread intelligence via signal_evidence → thread_packets → thread_intelligence
  const enriched = [];

  for (const signal of signals) {
    const threadIntels = db.prepare(`
      SELECT ti.not_x_its_y, ti.failed_solutions, ti.pain_language, ti.key_insight, ti.desire_type
      FROM thread_intelligence ti
      JOIN thread_packets tp ON tp.thread_id = ti.thread_id
      JOIN signal_evidence se ON se.evidence_id = tp.evidence_id
      WHERE se.signal_id = ?
    `).all(signal.id);

    // Aggregate failed solutions across all threads for this signal
    const allFailed = new Set();
    const allNotXItsY = [];
    const allPainPhrases = new Set();

    for (const ti of threadIntels) {
      const failed = safeParseJson(ti.failed_solutions, []);
      for (const f of failed) {
        if (f.name) allFailed.add(f.name.toLowerCase().trim());
      }

      const nxy = safeParseJson(ti.not_x_its_y, []);
      allNotXItsY.push(...nxy);

      const pain = safeParseJson(ti.pain_language, []);
      for (const p of pain) {
        if (p.quote) {
          for (const word of wordTokens(p.quote)) allPainPhrases.add(word);
        }
      }
    }

    // Also include signal-level failed solutions (from regex)
    const signalFailed = safeParseJson(signal.failed_solutions, []);
    for (const f of signalFailed) {
      if (f.name) allFailed.add(f.name.toLowerCase().trim());
    }

    enriched.push({
      id: signal.id,
      title: signal.title,
      communities: safeParseJson(signal.communities, []),
      failedSolutions: allFailed,
      notXItsY: allNotXItsY,
      painPhrases: allPainPhrases,
    });
  }

  return enriched;
}

/**
 * Detect potential signal cases for a context.
 * Returns groups of signal IDs that should be merged into cases.
 */
export function detectCases(contextId) {
  const signals = getSignalIntelligence(contextId);
  if (signals.length < 2) return [];

  const cases = [];
  const assigned = new Set();

  for (let i = 0; i < signals.length; i++) {
    if (assigned.has(signals[i].id)) continue;

    const group = [signals[i]];

    for (let j = i + 1; j < signals.length; j++) {
      if (assigned.has(signals[j].id)) continue;

      const similarity = computeSignalSimilarity(signals[i], signals[j]);
      if (similarity >= 0.3) {
        group.push(signals[j]);
      }
    }

    if (group.length >= 2) {
      cases.push({
        signals: group,
        title: deriveCaseTitle(group),
        similarity: group.length,
      });
      for (const s of group) assigned.add(s.id);
    }
  }

  return cases;
}

function computeSignalSimilarity(a, b) {
  let score = 0;

  // Shared failed solutions — fuzzy match (substring containment)
  let sharedFailedCount = 0;
  for (const fa of a.failedSolutions) {
    for (const fb of b.failedSolutions) {
      if (fa === fb || fa.includes(fb) || fb.includes(fa) || fuzzyTokenMatch(fa, fb) > 0.4) {
        sharedFailedCount++;
        break;
      }
    }
  }
  if (sharedFailedCount >= 2) score += 0.5;
  else if (sharedFailedCount === 1) score += 0.15;

  // Matching not_x_its_y — use word token overlap (looser than strict Jaccard)
  let nxyMatch = false;
  for (const nA of a.notXItsY) {
    for (const nB of b.notXItsY) {
      const surfaceSim = jaccardSimilarity(wordTokens(nA.surface), wordTokens(nB.surface));
      const deeperSim = jaccardSimilarity(wordTokens(nA.deeper), wordTokens(nB.deeper));
      if (surfaceSim > 0.2 || deeperSim > 0.2) {
        score += 0.3;
        nxyMatch = true;
        break;
      }
    }
    if (nxyMatch) break;
  }

  // Signal title/topic similarity (catches "social listening" appearing in multiple signals)
  const titleSim = jaccardSimilarity(wordTokens(a.title), wordTokens(b.title));
  if (titleSim > 0.3) score += 0.35;
  else if (titleSim > 0.15) score += 0.15;

  // Pain language overlap (weaker signal)
  const painSim = jaccardSimilarity(a.painPhrases, b.painPhrases);
  score += painSim * 0.2;

  return Math.min(score, 1.0);
}

function fuzzyTokenMatch(a, b) {
  const tokA = wordTokens(a);
  const tokB = wordTokens(b);
  return jaccardSimilarity(tokA, tokB);
}

function deriveCaseTitle(group) {
  // Find most common failed solution across the group
  const solutionCounts = new Map();
  for (const s of group) {
    for (const f of s.failedSolutions) {
      solutionCounts.set(f, (solutionCounts.get(f) || 0) + 1);
    }
  }

  const topSolution = [...solutionCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const communities = group.flatMap(s => s.communities).slice(0, 3).join(", ");

  if (topSolution && topSolution[1] >= 2) {
    return `${topSolution[0]} frustration (${communities})`;
  }

  // Fallback: use signal titles
  return group.map(s => s.title).slice(0, 2).join(" + ");
}

/**
 * Store detected cases in the database.
 */
export function storeCases(cases, contextId) {
  const db = getDb();
  let stored = 0;

  const insertCase = db.prepare(`
    INSERT OR IGNORE INTO signal_cases (id, context_id, title, description, status)
    VALUES (?, ?, ?, ?, 'open')
  `);

  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO signal_case_members (case_id, signal_id)
    VALUES (?, ?)
  `);

  const updateSignal = db.prepare(
    `UPDATE signals SET case_id = ? WHERE id = ?`
  );

  const store = db.transaction(() => {
    for (const c of cases) {
      const caseId = crypto.randomUUID();
      const description = `Signals: ${c.signals.map(s => s.title).join(", ")}`;

      insertCase.run(caseId, contextId, c.title, description);

      for (const signal of c.signals) {
        insertMember.run(caseId, signal.id);
        updateSignal.run(caseId, signal.id);
      }

      // Intelligence chain: create L3 cross_community unit
      try {
        const parentIds = c.signals.flatMap(s => getCrossThreadIds(s.id));
        createUnit({
          unitType: "cross_community",
          claim: `"${c.title}" \u2014 pattern confirmed across ${c.signals.length} communities`,
          detail: c.signals.map(s => s.title).join(", "),
          sourceType: "signal_case", sourceId: caseId,
          method: "aggregation",
          parentIds,
          contextId,
          confidence: Math.min(0.95, 0.5 + c.signals.length * 0.1),
          confidenceBasis: c.signals.length + " independent communities",
          createdBy: "signal-cases",
        });
      } catch (e) { /* non-blocking */ }

      stored++;
    }
  });

  store();
  return stored;
}
