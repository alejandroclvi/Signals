/**
 * Research Director — autonomous research loop that adapts queries
 * based on what the system is finding in real-time.
 *
 * Instead of running static queries and hoping for balanced coverage,
 * the director:
 *   1. Assesses current evidence distribution (coverage gaps)
 *   2. Analyzes what's working (high-yield queries, communities)
 *   3. Uses LLM to generate adaptive queries targeting the gaps
 *   4. Runs discovery with those queries
 *   5. Classifies new evidence inline with LLM
 *   6. Re-assesses and decides: continue, pivot, or stop
 *
 * The key innovation: query generation is informed by the ACTUAL
 * vocabulary and tool names from existing evidence. The LLM generates
 * queries in the language people actually use, not marketing-speak.
 */

import "../lib/env.mjs";
import { getDb } from "../db/connection.mjs";
import { classifyPackets } from "./llm-classifier.mjs";
import { refreshSignals } from "./refresh-signals.mjs";
import { getAgentMode, getStateTargets, buildSystemPrompt, buildPromptSuffix } from "./agent-modes.mjs";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "google/gemini-2.0-flash-001";

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Resolve the agent mode for a given context.
 * Priority: explicit option > context.agent_mode > "research" default.
 */
function resolveAgentMode(contextId, explicitMode) {
  if (explicitMode) return explicitMode;
  const db = getDb();
  const ctx = db.prepare("SELECT agent_mode FROM contexts WHERE id = ?").get(contextId);
  return ctx?.agent_mode || "research";
}

/**
 * Assess current evidence coverage for a context.
 * Returns gaps, yields, and a recommendation.
 *
 * @param {string} contextId
 * @param {object} options
 * @param {string} options.agentMode — override agent mode (default: context setting or "research")
 */
export function assessCoverage(contextId, options = {}) {
  const agentMode = resolveAgentMode(contextId, options.agentMode);
  const STATE_TARGETS = getStateTargets(agentMode);
  const db = getDb();

  // State distribution
  const stateRows = db.prepare(
    `SELECT evidence_state, COUNT(*) as c FROM evidence_packets
     WHERE context_id = ? AND evidence_state IS NOT NULL
     GROUP BY evidence_state`
  ).all(contextId);

  const stateDist = {};
  let total = 0;
  for (const r of stateRows) {
    stateDist[r.evidence_state] = r.c;
    total += r.c;
  }

  if (total === 0) {
    return {
      gaps: Object.entries(STATE_TARGETS).map(([state, target]) => ({
        state, targetPct: Math.round(target * 100), actualPct: 0, deficit: Math.round(target * 100), priority: 1,
      })),
      totalEvidence: 0,
      stateDist: {},
      isBalanced: false,
      isPlateaued: false,
      communityYields: [],
      queryYields: [],
      topVocabulary: {},
      topTools: [],
      highValueCommunities: [],
      saturatedCommunities: [],
      awarenessDist: {},
      recommendation: "No evidence yet — run initial discovery",
    };
  }

  // Compute gaps
  const gaps = [];
  for (const [state, target] of Object.entries(STATE_TARGETS)) {
    const actual = (stateDist[state] || 0) / total;
    const deficit = target - actual;
    if (deficit > 0.03) {
      gaps.push({
        state,
        targetPct: Math.round(target * 100),
        actualPct: Math.round(actual * 100),
        deficit: Math.round(deficit * 100),
        priority: deficit / target,
      });
    }
  }
  gaps.sort((a, b) => b.priority - a.priority);

  // Community yields — which communities produce highest quality evidence
  const communityYields = db.prepare(`
    SELECT community,
           COUNT(*) as count,
           ROUND(AVG(evidence_weight), 2) as avg_weight,
           COUNT(DISTINCT author_ref) as unique_authors
    FROM evidence_packets
    WHERE context_id = ?
    GROUP BY community
    ORDER BY avg_weight DESC
  `).all(contextId);

  // Query yields — which queries produced best evidence
  const queryYields = db.prepare(`
    SELECT topics, COUNT(*) as count,
           ROUND(AVG(evidence_weight), 2) as avg_weight,
           ROUND(AVG(CASE WHEN evidence_state IN ('tried_failed', 'warning', 'found_what_works') THEN 1.0 ELSE 0.0 END), 2) as high_value_ratio
    FROM evidence_packets
    WHERE context_id = ?
    GROUP BY topics
    ORDER BY avg_weight DESC
    LIMIT 20
  `).all(contextId);

  // Parse topics JSON for readability
  for (const q of queryYields) {
    const parsed = safeParseJson(q.topics, []);
    q.query = parsed[0] || q.topics;
  }

  // Top vocabulary — extracted from vocabulary table for this context
  const topVocabulary = {};
  const vocabRows = db.prepare(`
    SELECT sv.category, sv.phrase, sv.total_upvotes, sv.frequency
    FROM signal_vocabulary sv
    JOIN signals s ON s.id = sv.signal_id
    WHERE s.context_id = ? AND s.dismissed = 0
    ORDER BY sv.total_upvotes DESC
    LIMIT 30
  `).all(contextId);

  for (const v of vocabRows) {
    if (!topVocabulary[v.category]) topVocabulary[v.category] = [];
    topVocabulary[v.category].push({ phrase: v.phrase, upvotes: v.total_upvotes, frequency: v.frequency });
  }

  // Top tools mentioned (from solution vocabulary)
  const topTools = (topVocabulary.solution || [])
    .slice(0, 8)
    .map(t => t.phrase);

  // Awareness distribution
  const awarenessDist = {};
  db.prepare(
    `SELECT awareness_level, COUNT(*) as c FROM evidence_packets
     WHERE context_id = ? AND awareness_level IS NOT NULL
     GROUP BY awareness_level`
  ).all(contextId).forEach(r => { awarenessDist[r.awareness_level] = r.c; });

  // Confidence plateau detection — check if last N evidence packets changed anything
  const signalCount = db.prepare(
    "SELECT COUNT(*) as c FROM signals WHERE context_id = ? AND dismissed = 0"
  ).get(contextId).c;

  const highConfidence = db.prepare(
    "SELECT COUNT(*) as c FROM signals WHERE context_id = ? AND dismissed = 0 AND confidence = 'High'"
  ).get(contextId).c;

  const isPlateaued = total > 500 && highConfidence >= signalCount * 0.6;

  // Saturation detection per community
  const saturated = communityYields.filter(c => c.count > 200 && c.avg_weight < 1.2);
  const highValue = communityYields.filter(c => c.avg_weight >= 1.5 && c.count >= 5);

  // Build recommendation
  let recommendation;
  if (gaps.length === 0) {
    recommendation = isPlateaued
      ? "Coverage balanced and signal confidence high — generate research brief"
      : "Coverage balanced — continue monitoring or generate brief";
  } else {
    const topGap = gaps[0];
    recommendation = `Focus on "${topGap.state}" (${topGap.actualPct}% vs ${topGap.targetPct}% target). `;
    if (highValue.length > 0) {
      recommendation += `High-yield communities: ${highValue.slice(0, 3).map(c => c.community).join(", ")}. `;
    }
    if (saturated.length > 0) {
      recommendation += `Saturated (avoid): ${saturated.map(c => c.community).join(", ")}.`;
    }
  }

  return {
    gaps,
    stateDist,
    totalEvidence: total,
    isBalanced: gaps.length === 0,
    isPlateaued,
    communityYields,
    queryYields: queryYields.map(q => ({ query: q.query, count: q.count, avgWeight: q.avg_weight, highValueRatio: q.high_value_ratio })),
    topVocabulary,
    topTools,
    awarenessDist,
    saturatedCommunities: saturated.map(c => c.community),
    highValueCommunities: highValue.map(c => c.community),
    recommendation,
  };
}

/**
 * Generate adaptive queries using LLM, informed by current evidence.
 * This is the core intelligence — it reads what's been found and
 * generates the NEXT queries to fill coverage gaps.
 */
export async function generateAdaptiveQueries(contextId, options = {}) {
  const agentMode = resolveAgentMode(contextId, options.agentMode);
  const coverage = assessCoverage(contextId, { agentMode });
  const db = getDb();
  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(contextId);

  if (!context) throw new Error("Context not found: " + contextId);
  if (coverage.gaps.length === 0 && !options.force) {
    return { queries: [], coverage, reason: "Coverage is balanced — no gaps to fill" };
  }

  // Build the prompt with full context
  const topGaps = coverage.gaps.slice(0, 3);

  const STATE_DESCRIPTIONS = {
    experiencing_pain: "People describing frustration/problems from direct experience — no specific tool mentioned",
    tried_failed: "People who used a specific tool/approach and it didn't work — includes tool name + negative outcome",
    seeking: "People actively looking for a solution, asking for recommendations",
    found_what_works: "People sharing positive experiences with a specific tool — includes tool name + positive outcome",
    warning: "People explicitly telling others to avoid something — stronger than just negative",
    comparing: "Head-to-head comparisons of specific tools or approaches",
    sharing_insight: "People sharing knowledge, tips, or experience without strong emotion",
    promoting: "People promoting their own product — low research value",
  };

  const prompt = buildAdaptivePrompt({
    agentMode,
    topic: context.label,
    thesis: context.thesis,
    avatar: context.avatar,
    totalEvidence: coverage.totalEvidence,
    stateDist: coverage.stateDist,
    gaps: topGaps,
    stateDescriptions: STATE_DESCRIPTIONS,
    topTools: coverage.topTools,
    topVocabulary: coverage.topVocabulary,
    highValueCommunities: coverage.highValueCommunities,
    saturatedCommunities: coverage.saturatedCommunities,
    queryYields: coverage.queryYields.slice(0, 10),
    awarenessDist: coverage.awarenessDist,
  });

  if (!OPENROUTER_API_KEY) {
    return { queries: fallbackQueries(topGaps, coverage.topTools), coverage, reason: "No API key — using fallback queries", agentMode };
  }

  const systemPrompt = buildSystemPrompt(agentMode);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://signals.local",
        "X-Title": "Signals Research Director",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      console.warn(`Research director API error ${res.status}`);
      return { queries: fallbackQueries(topGaps, coverage.topTools), coverage, reason: "API error — fallback queries" };
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { queries: fallbackQueries(topGaps, coverage.topTools), coverage, reason: "JSON parse error — fallback queries" };
    }

    const queries = (parsed.queries || parsed.adaptive_queries || [])
      .filter(q => q.query && q.target_state)
      .map(q => ({
        query: q.query,
        targetState: q.target_state,
        rationale: q.rationale || "",
        targetCommunities: q.target_communities || [],
      }));

    const thesisCheck = parsed.thesis_check || null;
    const avatarRefinement = parsed.avatar_refinement || null;
    const shouldContinue = parsed.should_continue !== false;

    return {
      queries,
      coverage,
      thesisCheck,
      avatarRefinement,
      shouldContinue,
      agentMode,
      reason: `[${agentMode}] Generated ${queries.length} adaptive queries for ${topGaps.map(g => g.state).join(", ")}`,
    };
  } catch (err) {
    console.warn("Research director error:", err.message);
    return { queries: fallbackQueries(topGaps, coverage.topTools), coverage, agentMode, reason: "Error — fallback queries" };
  }
}

/**
 * Run one research round: assess → generate → discover → classify → refresh.
 *
 * @param {string} contextId
 * @param {object} options
 * @param {function} options.onProgress — SSE-style progress callback
 * @param {function} options.discover — discovery function (injected for testability)
 * @param {boolean} options.llmClassify — use LLM for inline classification (default true)
 * @returns {{ evidenceCount, signalCount, queriesUsed, coverageBefore, coverageAfter }}
 */
export async function runResearchRound(contextId, options = {}) {
  const { onProgress = () => {}, llmClassify = true, afterDate, beforeDate, agentMode: explicitAgent } = options;
  const agentMode = resolveAgentMode(contextId, explicitAgent);
  const db = getDb();

  // 1. Assess current coverage
  onProgress({ stage: "assess", message: `Assessing evidence coverage (agent: ${agentMode})...` });
  const coverageBefore = assessCoverage(contextId, { agentMode });

  if (coverageBefore.isBalanced && coverageBefore.isPlateaued) {
    onProgress({ stage: "done", message: "Research saturated — coverage balanced, confidence high" });
    return {
      evidenceCount: 0, signalCount: 0, queriesUsed: 0,
      coverageBefore, coverageAfter: coverageBefore,
      agentMode, stopped: true, reason: "Coverage balanced and plateaued",
    };
  }

  // 2. Generate adaptive queries
  onProgress({ stage: "generate", message: "Generating adaptive queries..." });
  const { queries, thesisCheck, shouldContinue } = await generateAdaptiveQueries(contextId, { agentMode });

  if (queries.length === 0) {
    onProgress({ stage: "done", message: "No queries generated — coverage may be balanced" });
    return {
      evidenceCount: 0, signalCount: 0, queriesUsed: 0,
      coverageBefore, coverageAfter: coverageBefore,
      stopped: true, reason: "No adaptive queries generated",
    };
  }

  // 3. Report thesis check if the LLM flagged something
  if (thesisCheck && thesisCheck.status !== "confirmed") {
    onProgress({
      stage: "thesis",
      message: `Thesis ${thesisCheck.status}: ${thesisCheck.refinement || thesisCheck.reason || ""}`,
    });
  }

  // 4. Run discovery with adaptive queries
  onProgress({
    stage: "discover",
    message: `Discovering evidence for ${queries.length} queries: ${queries.map(q => q.targetState).join(", ")}`,
  });

  const queryStrings = queries.map(q => q.query);

  // Store adaptive queries in discovered file for ingestion
  const fs = await import("node:fs");
  const path = await import("node:path");
  const discoveredPath = path.resolve("data", `adaptive-${contextId}.json`);

  // Store queries and their metadata for the ingestion pipeline
  const adaptiveRecord = {
    contextId,
    generatedAt: new Date().toISOString(),
    queries: queries,
    coverageGaps: coverageBefore.gaps,
  };
  fs.writeFileSync(discoveredPath, JSON.stringify(adaptiveRecord, null, 2));

  // Use the deepen API pattern: run ingest with targeted queries
  let evidenceCount = 0;
  let errors = 0;

  // Build Reddit search queries
  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(contextId);
  const highValueCommunities = coverageBefore.highValueCommunities.slice(0, 5);

  // Import ingest function
  const { ingestReddit } = await import("./ingest.mjs");

  try {
    const result = await ingestReddit({
      contextId,
      queries: queryStrings,
      subreddits: highValueCommunities.length > 0 ? highValueCommunities : undefined,
      limit: 5, // per query
      afterDate,
      beforeDate,
    });
    evidenceCount = result?.evidenceCount || 0;
  } catch (err) {
    errors++;
    onProgress({ stage: "error", message: `Ingestion error: ${err.message}` });
  }

  // 5. LLM classify new evidence (upgrade from regex)
  if (llmClassify && evidenceCount > 0) {
    onProgress({ stage: "classify", message: `LLM classifying ${evidenceCount} new packets...` });

    try {
      // Get the most recent packets (just ingested)
      const recentPackets = db.prepare(`
        SELECT id, title, body FROM evidence_packets
        WHERE context_id = ?
        ORDER BY observed_at DESC
        LIMIT ?
      `).all(contextId, evidenceCount);

      if (recentPackets.length > 0) {
        const classifications = await classifyPackets(recentPackets);

        const update = db.prepare(`
          UPDATE evidence_packets
          SET evidence_state = ?, intent = ?, awareness_level = ?, sentiment = ?
          WHERE id = ?
        `);

        const run = db.transaction(() => {
          for (const [id, c] of classifications) {
            update.run(c.evidence_state, c.intent, c.awareness_level, c.sentiment, id);
          }
        });
        run();
      }
    } catch (err) {
      onProgress({ stage: "warn", message: `LLM classification failed, keeping regex: ${err.message}` });
    }
  }

  // 6. Refresh signals
  onProgress({ stage: "refresh", message: "Refreshing signals with new evidence..." });
  const refreshResult = refreshSignals(contextId);

  // 7. Re-assess coverage
  const coverageAfter = assessCoverage(contextId, { agentMode });

  // 8. Report results
  const improvement = coverageBefore.gaps.map(gap => {
    const after = coverageAfter.gaps.find(g => g.state === gap.state);
    const afterPct = after ? after.actualPct : (coverageAfter.stateDist[gap.state] || 0) / coverageAfter.totalEvidence * 100;
    return {
      state: gap.state,
      before: gap.actualPct,
      after: Math.round(afterPct),
      improved: Math.round(afterPct) > gap.actualPct,
    };
  });

  onProgress({
    stage: "done",
    message: `Round complete: +${evidenceCount} evidence, ${refreshResult.signalCount} signals`,
    improvement,
  });

  return {
    evidenceCount,
    signalCount: refreshResult.signalCount,
    queriesUsed: queries.length,
    errors,
    coverageBefore,
    coverageAfter,
    improvement,
    thesisCheck,
    stopped: false,
  };
}

/**
 * Run a full research loop — multiple rounds until coverage is balanced
 * or budget is exhausted.
 *
 * @param {string} contextId
 * @param {object} options
 * @param {number} options.maxRounds — max research rounds (default 3)
 * @param {function} options.onProgress — progress callback
 * @returns {{ rounds, totalEvidence, finalCoverage, decisions }}
 */
export async function runResearchLoop(contextId, options = {}) {
  const { maxRounds = 3, onProgress = () => {}, afterDate, beforeDate, agentMode: explicitAgent } = options;
  const agentMode = resolveAgentMode(contextId, explicitAgent);

  const decisions = [];
  let totalEvidence = 0;
  let round = 0;

  onProgress({ stage: "start", message: `Starting research loop (max ${maxRounds} rounds)...` });

  while (round < maxRounds) {
    round++;
    onProgress({ stage: "round", message: `=== Round ${round}/${maxRounds} ===`, round });

    const result = await runResearchRound(contextId, {
      afterDate,
      beforeDate,
      agentMode,
      onProgress: (event) => {
        onProgress({ ...event, round });
      },
    });

    totalEvidence += result.evidenceCount;

    decisions.push({
      round,
      queriesUsed: result.queriesUsed,
      evidenceAdded: result.evidenceCount,
      gapsBefore: result.coverageBefore.gaps.length,
      gapsAfter: result.coverageAfter.gaps.length,
      improvement: result.improvement,
      thesisCheck: result.thesisCheck,
      stopped: result.stopped,
    });

    // Stop conditions
    if (result.stopped) {
      onProgress({ stage: "stop", message: `Stopped: ${result.reason}`, round });
      break;
    }

    if (result.coverageAfter.isBalanced) {
      onProgress({ stage: "balanced", message: "Coverage balanced — research complete", round });
      break;
    }

    if (result.evidenceCount === 0) {
      onProgress({ stage: "stop", message: "No new evidence found — stopping", round });
      break;
    }

    // Rate limiting between rounds
    if (round < maxRounds) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const finalCoverage = assessCoverage(contextId, { agentMode });

  onProgress({
    stage: "complete",
    message: `Research loop complete: ${round} rounds, +${totalEvidence} evidence, ${finalCoverage.gaps.length} remaining gaps`,
  });

  return {
    rounds: round,
    totalEvidence,
    finalCoverage,
    decisions,
  };
}

// --- LLM Prompts ---
// System prompts are now in agent-modes.mjs. The old hardcoded prompt lives there as the "research" mode.

function buildAdaptivePrompt({ agentMode, topic, thesis, avatar, totalEvidence, stateDist, gaps, stateDescriptions, topTools, topVocabulary, highValueCommunities, saturatedCommunities, queryYields, awarenessDist }) {
  const parts = [];

  parts.push(`RESEARCH TOPIC: ${topic}`);
  if (thesis) parts.push(`WORKING THESIS: ${thesis}`);
  if (avatar) parts.push(`WORKING AVATAR: ${avatar}`);
  parts.push(`TOTAL EVIDENCE: ${totalEvidence} posts\n`);

  // State distribution
  parts.push("CURRENT EVIDENCE DISTRIBUTION:");
  const total = Object.values(stateDist).reduce((s, v) => s + v, 0) || 1;
  for (const [state, count] of Object.entries(stateDist).sort((a, b) => b[1] - a[1])) {
    const pct = Math.round(count / total * 100);
    parts.push(`  ${state}: ${pct}% (${count} posts)`);
  }

  // Gaps to fill
  if (gaps.length > 0) {
    parts.push("\nCOVERAGE GAPS TO FILL:");
    for (const g of gaps) {
      const desc = stateDescriptions[g.state] || g.state;
      parts.push(`  ${g.state}: ${g.actualPct}% (target: ${g.targetPct}%) — ${desc}`);
    }
  }

  // Tools mentioned
  if (topTools.length > 0) {
    parts.push("\nTOOLS/SOLUTIONS MENTIONED: " + topTools.join(", "));
  }

  // Vocabulary by category
  if (topVocabulary.pain && topVocabulary.pain.length > 0) {
    parts.push("\nTOP PAIN PHRASES (what people actually say):");
    for (const v of topVocabulary.pain.slice(0, 5)) {
      parts.push(`  "${v.phrase}" (${v.upvotes} upvotes, ${v.frequency}x)`);
    }
  }
  if (topVocabulary.desire && topVocabulary.desire.length > 0) {
    parts.push("\nTOP DESIRE PHRASES:");
    for (const v of topVocabulary.desire.slice(0, 5)) {
      parts.push(`  "${v.phrase}" (${v.upvotes} upvotes)`);
    }
  }

  // Community intel
  if (highValueCommunities.length > 0) {
    parts.push("\nHIGH-VALUE COMMUNITIES (prioritize): " + highValueCommunities.join(", "));
  }
  if (saturatedCommunities.length > 0) {
    parts.push("SATURATED COMMUNITIES (avoid): " + saturatedCommunities.join(", "));
  }

  // Best-performing queries
  if (queryYields.length > 0) {
    parts.push("\nQUERIES THAT PRODUCED BEST EVIDENCE:");
    for (const q of queryYields.slice(0, 5)) {
      parts.push(`  "${q.query}" — ${q.count} results, avg weight ${q.avgWeight}, high-value ratio ${q.highValueRatio}`);
    }
  }

  // Awareness distribution
  if (Object.keys(awarenessDist).length > 0) {
    parts.push("\nAWARENESS LEVEL DISTRIBUTION:");
    const awTotal = Object.values(awarenessDist).reduce((s, v) => s + v, 0) || 1;
    for (const [level, count] of Object.entries(awarenessDist).sort((a, b) => b[1] - a[1])) {
      parts.push(`  ${level}: ${Math.round(count / awTotal * 100)}%`);
    }
  }

  // The ask — agent-mode-specific instructions
  parts.push(`\nGENERATE ${Math.min(gaps.length * 3, 8)} search queries targeting the coverage gaps.`);
  parts.push("Use the vocabulary and tool names from the evidence above.");
  parts.push(buildPromptSuffix(agentMode));

  return parts.join("\n");
}

/**
 * Fallback queries when LLM is unavailable.
 * Uses query mutation from existing tool names + state-specific modifiers.
 */
function fallbackQueries(gaps, tools) {
  const stateModifiers = {
    tried_failed: ["didn't work", "regret", "waste of money", "switched from", "gave up on"],
    found_what_works: ["actually works", "game changer", "love using", "best thing", "finally found"],
    warning: ["don't waste", "avoid", "save your money", "biggest mistake", "learned hard way"],
    comparing: ["vs", "compared to", "which is better", "pros and cons", "switched from to"],
    seeking: ["looking for alternative", "need help with", "recommend", "best option for", "is there"],
    experiencing_pain: ["frustrated with", "struggling with", "broken", "nightmare", "impossible to"],
  };

  const queries = [];
  for (const gap of gaps.slice(0, 3)) {
    const modifiers = stateModifiers[gap.state] || stateModifiers.seeking;
    const tool = tools[0] || "tool";
    for (const mod of modifiers.slice(0, 2)) {
      queries.push({
        query: `${tool} ${mod}`,
        targetState: gap.state,
        rationale: `Fallback query targeting ${gap.state} gap`,
        targetCommunities: [],
      });
    }
  }
  return queries;
}
