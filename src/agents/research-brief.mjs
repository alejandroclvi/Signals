/**
 * Research Brief Agent
 *
 * Generates structured research briefs from collected evidence using Claude.
 * Follows the 3-pass research methodology from the ad copywriting framework:
 *
 *   1. Problem language — their exact words, specific moments of pain
 *   2. Emotional depth — identity-level pain, "Not X, it's Y" moments
 *   3. Failed solutions — what they tried, community validation via upvotes
 *
 * Output: thesis, avatar, problem language, emotional depth, failed solutions,
 *         awareness verdict, desire type classification.
 *
 * Can run in two modes:
 *   - FROM EVIDENCE: analyze collected evidence packets for a context
 *   - FROM TOPIC: generate a research brief for a new topic (no evidence yet)
 */

import "../lib/env.mjs";
import { getDb } from "../db/connection.mjs";
import { createUnits } from "../pipeline/intelligence-chain.mjs";
import crypto from "node:crypto";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  throw new Error("Missing OPENROUTER_API_KEY — set it in .env or environment");
}

const DEFAULT_MODEL = "google/gemini-2.0-flash-001";

async function chatCompletion(system, userMessage, options = {}) {
  const model = options.model || DEFAULT_MODEL;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://signals.local",
      "X-Title": "Signals Research Agent",
    },
    body: JSON.stringify({
      model,
      max_tokens: options.max_tokens || 4096,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    text: data.choices[0].message.content,
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 },
    model: data.model,
  };
}

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

const SYSTEM_PROMPT = `You are a Research Intel agent. Your job is to analyze online community evidence and produce structured research briefs that reveal what people ACTUALLY experience — not what marketers assume.

You follow the 3-pass research methodology:
- Pass 1: Problem language — their EXACT words. Specific moments when they feel the problem. Not clinical terms. When does it happen? How often? What are they doing when it hits?
- Pass 2: Emotional depth — where the pain reaches identity level. The "Not X, it's Y" moment — the surface problem vs. what it actually does to their life/identity/confidence. Rock-bottom moments.
- Pass 3: Failed solutions — what they tried, what worked, what didn't. Upvote counts = community validation. High upvotes on "I tried X and it was garbage" means many people share that experience.

Critical rules:
- NEVER summarize or paraphrase. Copy exact phrases and quotes.
- Comments with high upvotes are MORE valuable than main posts — they represent community-validated experience.
- Look for the GAP between what people SAY they want and what they ACTUALLY do.
- The "Not X, it's Y" statement is the most important finding. It reveals the behavioral driver beneath the surface complaint.
- Don't label something as "failed" if evidence shows people having positive experiences with it.
- Awareness level classification must be backed by evidence (what have they already tried?).`;

const BRIEF_FROM_EVIDENCE_PROMPT = `Analyze the following evidence packets collected from online communities and produce a complete research brief.

CONTEXT:
Topic: {{topic}}
{{#if thesis}}Working thesis: {{thesis}}{{/if}}
{{#if avatar}}Working avatar: {{avatar}}{{/if}}

EVIDENCE ({{evidenceCount}} packets from {{communityCount}} communities):

{{evidence}}

---

Produce a research brief with this EXACT structure (use the headers exactly as shown):

## THESIS
One paragraph. Why is this signal important? What does it predict? What behavior change is happening?

## AVATAR
Who is this person? Be specific: age range, role, daily reality, what they've tried, what stage they're at. Write it as if you're describing ONE real person you just read about.

## PROBLEM LANGUAGE (Pass 1)
List 8-15 exact quotes that show how they describe the problem. Include the community and upvote count.
Format: "exact quote" — r/community (N upvotes)

## EMOTIONAL DEPTH (Pass 2)
List 5-10 quotes showing identity-level pain, rock-bottom moments, or the "Not X, it's Y" revelation.
Format: "exact quote" — r/community (N upvotes)
After the quotes, write:
**NOT X, IT'S Y:** [surface problem] → [deeper behavioral driver]

## FAILED SOLUTIONS (Pass 3)
List every solution mentioned in the evidence with community validation.
Format: **Solution name** — "what they said about it" (N upvotes, N mentions) — VERDICT: worked/failed/mixed

## AWARENESS VERDICT
Classification: [UNAWARE | PROBLEM AWARE | SOLUTION AWARE | PRODUCT AWARE | MOST AWARE]
Evidence: [2-3 sentences explaining WHY this classification, citing specific evidence]

## DESIRE TYPE
Classification: [MASS INSTINCT | MASS TECHNOLOGICAL]
- Mass instinct = primal discovery demand (they don't know solutions exist)
- Mass technological = replacement demand (frustrated with existing solutions)
Evidence: [2-3 sentences explaining why]

## DISCOVERY QUERIES
Based on what you found, suggest 5 queries per pass that would find MORE of this signal:
Pass 1 (problem language): [5 queries]
Pass 2 (emotional depth): [5 queries]
Pass 3 (failed solutions): [5 queries]`;

const BRIEF_FROM_TOPIC_PROMPT = `You are generating a research brief for a NEW topic that hasn't been researched yet. Based on your knowledge of online communities and the topic described, produce a research brief that will GUIDE the discovery process.

TOPIC: {{topic}}
{{#if description}}Description: {{description}}{{/if}}

This is a HYPOTHESIS brief — it should tell the researcher:
1. Where to look (which communities, which search terms)
2. What to look for (what patterns suggest this signal exists)
3. Who the avatar likely is (based on where this pain would surface)
4. What awareness level to expect

Produce a research brief with this EXACT structure:

## THESIS
One paragraph. What behavior change do we hypothesize is happening? What would confirming this signal mean?

## AVATAR (Hypothesized)
Who is likely experiencing this? Be specific but mark this as hypothesis until evidence confirms.

## EXPECTED PROBLEM LANGUAGE (Pass 1)
What phrases would this avatar use to describe the problem? List 10-15 predicted search queries written from the avatar's perspective — moments of pain, not keywords.

## EXPECTED EMOTIONAL DEPTH (Pass 2)
What would the identity-level pain look like? List 5-8 predicted queries that would surface rock-bottom moments.

## EXPECTED FAILED SOLUTIONS (Pass 3)
What solutions do we expect them to have tried? List 5-8 predicted queries that would surface failed solution discussions.

## PREDICTED AWARENESS LEVEL
Where do we expect the community to be on the spectrum? Why?

## PREDICTED DESIRE TYPE
Mass instinct (discovery) or mass technological (replacement)? Why?

## STATE-TARGETED QUERIES
Generate 4 queries per evidence state. Each query should find evidence that naturally classifies into that state.

**Experiencing pain** (people describing the problem as they feel it):
4 queries written as pain moments — what they'd type at 11 PM

**Tried & failed** (used a tool/approach, it didn't work):
4 queries mentioning specific tools + negative outcomes

**Seeking solution** (actively looking for something):
4 queries asking for recommendations or alternatives

**What works** (positive experiences):
4 queries about what people love or what's working for them

**Warning others** (telling people to avoid something):
4 queries surfacing warnings and "don't make this mistake" posts

**Comparing options** (evaluating alternatives):
4 queries with "vs", "compared to", "switched from X to Y"

## DISCOVERY PLAN
- Communities to search: [list 5-10 subreddits or community types]
- Noise signals to filter: [what would look relevant but isn't?]`;

function fillTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    // Simple conditionals
    const ifRegex = new RegExp(`\\{\\{#if ${key}\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}`, "g");
    result = value
      ? result.replace(ifRegex, "$1")
      : result.replace(ifRegex, "");
    // Variable substitution
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  // Remove any remaining unfilled conditionals
  result = result.replace(/\{\{#if \w+\}\}[\s\S]*?\{\{\/if\}\}/g, "");
  return result;
}

function formatEvidenceForPrompt(packets, limit = 80) {
  // Sort by evidence_weight descending — highest-value evidence first
  const sorted = [...packets].sort((a, b) => (b.evidence_weight || 1) - (a.evidence_weight || 1));
  const selected = sorted.slice(0, limit);

  return selected.map((p, i) => {
    const metrics = safeParseJson(p.metrics, {});
    const score = metrics.score || 0;
    const comments = metrics.comments || 0;
    const weight = (p.evidence_weight || 1).toFixed(1);
    const type = p.source_item_id?.startsWith("t1_") ? "comment" : "post";

    let line = `[${i + 1}] ${type} | r/${p.community} | ${score} upvotes | ${comments} comments | weight: ${weight}`;
    if (p.intent) line += ` | intent: ${p.intent}`;
    if (p.awareness_level) line += ` | awareness: ${p.awareness_level}`;
    line += `\n`;
    if (p.title && type === "post") line += `Title: ${p.title}\n`;
    line += `${(p.body || "").slice(0, 600)}`;
    if ((p.body || "").length > 600) line += "...";
    return line;
  }).join("\n\n---\n\n");
}

/**
 * Generate a research brief from collected evidence.
 */
export async function generateBriefFromEvidence(contextId, options = {}) {
  const db = getDb();

  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(contextId);
  if (!context) throw new Error("Context not found: " + contextId);

  // Load evidence packets for this context
  const packets = db.prepare(
    `SELECT * FROM evidence_packets WHERE context_id = ? ORDER BY evidence_weight DESC`
  ).all(contextId);

  if (packets.length === 0) {
    throw new Error("No evidence packets found for context: " + contextId + ". Run ingestion first.");
  }

  // Get community stats
  const communities = new Set(packets.map(p => p.community).filter(Boolean));

  const prompt = fillTemplate(BRIEF_FROM_EVIDENCE_PROMPT, {
    topic: context.label,
    thesis: context.thesis,
    avatar: context.avatar,
    evidenceCount: String(packets.length),
    communityCount: String(communities.size),
    evidence: formatEvidenceForPrompt(packets, options.evidenceLimit || 80),
  });

  const response = await chatCompletion(SYSTEM_PROMPT, prompt, {
    model: options.model || DEFAULT_MODEL,
    max_tokens: 4096,
  });

  const briefContent = response.text;
  const briefId = crypto.randomUUID();
  const modelUsed = response.model || options.model || DEFAULT_MODEL;

  // Parse structured sections from the brief
  const parsed = parseBriefSections(briefContent);

  // Store in database
  db.prepare(`
    INSERT INTO research_briefs (id, context_id, mode, topic, brief_content, thesis, avatar, problem_language, emotional_depth, failed_solutions, awareness_verdict, desire_type, discovery_queries, evidence_count, community_count, model_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    briefId,
    contextId,
    "from_evidence",
    context.label,
    briefContent,
    parsed.thesis,
    parsed.avatar,
    parsed.problemLanguage,
    parsed.emotionalDepth,
    parsed.failedSolutions,
    parsed.awarenessVerdict,
    parsed.desireType,
    parsed.discoveryQueries,
    packets.length,
    communities.size,
    modelUsed
  );

  return {
    id: briefId,
    contextId,
    content: briefContent,
    parsed,
    evidenceCount: packets.length,
    communityCount: communities.size,
    tokensUsed: response.usage,
  };
}

/**
 * Generate a research brief from the INTELLIGENCE LAYER (not raw evidence).
 *
 * Uses pre-computed signals, thread intelligence, facets, and signal cases
 * instead of raw Reddit posts. The LLM synthesizes findings rather than
 * discovering patterns from scratch.
 *
 * Falls back to generateBriefFromEvidence if no intelligence data exists.
 */
export async function generateBriefFromIntelligence(contextId, options = {}) {
  const db = getDb();

  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(contextId);
  if (!context) throw new Error("Context not found: " + contextId);

  // Check if we have intelligence data
  const intelCount = db.prepare(
    `SELECT COUNT(*) as c FROM thread_intelligence WHERE context_id = ?`
  ).get(contextId).c;

  if (intelCount === 0) {
    // Fall back to raw evidence mode
    return generateBriefFromEvidence(contextId, options);
  }

  // --- Gather all intelligence ---

  // Signals ranked by score
  const signals = db.prepare(
    `SELECT s.*, sr.components, sr.total as score_total
     FROM signals s
     LEFT JOIN scoring_runs sr ON sr.signal_id = s.id
     WHERE s.context_id = ? AND s.dismissed = 0
     ORDER BY sr.total DESC
     LIMIT 15`
  ).all(contextId);

  // Thread intelligence (all non-noise)
  const threadIntels = db.prepare(
    `SELECT ti.*, t.title as thread_title, t.community, t.comment_count, t.total_score
     FROM thread_intelligence ti
     JOIN threads t ON t.id = ti.thread_id
     WHERE ti.context_id = ? AND ti.signal_quality != 'noise'
     ORDER BY t.total_score DESC`
  ).all(contextId);

  // Facets (all)
  const facets = db.prepare(
    `SELECT sf.*, s.title as signal_title
     FROM signal_facets sf
     JOIN signals s ON s.id = sf.signal_id
     WHERE s.context_id = ? AND s.dismissed = 0
     ORDER BY sf.total_upvotes DESC`
  ).all(contextId);

  // Signal cases
  const cases = db.prepare(
    `SELECT sc.*, GROUP_CONCAT(sm.signal_id) as signal_ids
     FROM signal_cases sc
     JOIN signal_case_members sm ON sm.case_id = sc.id
     WHERE sc.context_id = ?
     GROUP BY sc.id`
  ).all(contextId);

  // Evidence stats
  const evidenceStats = db.prepare(
    `SELECT COUNT(*) as total,
            COUNT(DISTINCT community) as communities,
            COUNT(DISTINCT author_ref) as authors
     FROM evidence_packets WHERE context_id = ?`
  ).get(contextId);

  // Awareness distribution across all evidence
  const awarenessDist = {};
  db.prepare(
    `SELECT awareness_level, COUNT(*) as c FROM evidence_packets
     WHERE context_id = ? AND awareness_level IS NOT NULL
     GROUP BY awareness_level ORDER BY c DESC`
  ).all(contextId).forEach(r => { awarenessDist[r.awareness_level] = r.c; });

  // --- Format for the LLM ---
  const prompt = formatIntelligencePrompt({
    context,
    signals,
    threadIntels,
    facets,
    cases,
    evidenceStats,
    awarenessDist,
  });

  const response = await chatCompletion(INTEL_SYSTEM_PROMPT, prompt, {
    model: options.model || DEFAULT_MODEL,
    max_tokens: 4096,
  });

  const briefContent = response.text;
  const briefId = crypto.randomUUID();
  const modelUsed = response.model || options.model || DEFAULT_MODEL;
  const parsed = parseBriefSections(briefContent);

  db.prepare(`
    INSERT INTO research_briefs (id, context_id, mode, topic, brief_content, thesis, avatar, problem_language, emotional_depth, failed_solutions, awareness_verdict, desire_type, discovery_queries, evidence_count, community_count, model_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    briefId,
    contextId,
    "from_intelligence",
    context.label,
    briefContent,
    parsed.thesis,
    parsed.avatar,
    parsed.problemLanguage,
    parsed.emotionalDepth,
    parsed.failedSolutions,
    parsed.awarenessVerdict,
    parsed.desireType,
    parsed.discoveryQueries,
    evidenceStats.total,
    evidenceStats.communities,
    modelUsed
  );

  // Intelligence chain: create L4 synthesis units for each brief section
  try {
    const parentIds = db.prepare(
      `SELECT id FROM intelligence_units WHERE context_id = ? AND unit_type IN ('cross_community', 'cross_thread') ORDER BY confidence DESC LIMIT 20`
    ).all(contextId).map(r => r.id);

    const units = [];
    for (const [section, content] of Object.entries(parsed)) {
      if (!content || content.length < 20) continue;
      const firstLine = content.split("\n").find(l => l.trim().length > 10) || content.slice(0, 200);
      units.push({
        unitType: "synthesis",
        claim: firstLine.slice(0, 200),
        detail: content,
        sourceType: "research_brief", sourceId: briefId,
        method: "synthesis",
        parentIds,
        contextId,
        confidence: 0.7,
        confidenceBasis: "LLM synthesis from " + threadIntels.length + " thread analyses",
        createdBy: "research-brief",
      });
    }
    if (units.length > 0) createUnits(units);
  } catch (e) { /* non-blocking */ }

  return {
    id: briefId,
    contextId,
    content: briefContent,
    parsed,
    evidenceCount: evidenceStats.total,
    communityCount: evidenceStats.communities,
    tokensUsed: response.usage,
    mode: "from_intelligence",
    intelligenceStats: {
      signals: signals.length,
      threadsAnalyzed: threadIntels.length,
      facets: facets.length,
      cases: cases.length,
    },
  };
}

const INTEL_SYSTEM_PROMPT = `You are a strategic intelligence analyst. You receive PRE-ANALYZED findings from an automated research pipeline — signals, thread analyses, behavioral patterns, failed solutions, and cross-community patterns. Your job is to SYNTHESIZE these into an actionable intelligence brief.

You are NOT discovering patterns from raw data. The pipeline already did that. Your job is to:
1. Connect the dots across findings
2. Identify the core opportunity or risk
3. Define the customer from real evidence (not hypotheses)
4. Map the competitive landscape from validated failures
5. Recommend specific action based on the evidence

Rules:
- Use exact quotes from the evidence when available — they are real and validated
- Upvote counts represent community validation (47 upvotes = 47 people agreeing)
- Cross-community patterns are stronger signals than single-community findings
- "Not X, it's Y" findings reveal the REAL behavioral driver — prioritize these
- Failed solutions with high upvotes are the most valuable competitive intelligence
- Be direct and specific. This brief drives decisions, not further research.`;

function formatIntelligencePrompt({ context, signals, threadIntels, facets, cases, evidenceStats, awarenessDist }) {
  const db = getDb();
  const parts = [];

  parts.push(`INTELLIGENCE BRIEF REQUEST: ${context.label}`);
  if (context.thesis) parts.push(`Working thesis: ${context.thesis}`);
  parts.push(`Evidence base: ${evidenceStats.total} posts from ${evidenceStats.communities} communities by ${evidenceStats.authors} authors`);
  parts.push("");

  // Top signals
  parts.push("═══ TOP SIGNALS (ranked by score) ═══");
  for (const sig of signals.slice(0, 10)) {
    const tags = safeParseJson(sig.tags, []);
    const communities = safeParseJson(sig.communities, []);
    parts.push(`\n▸ ${sig.title} — ${sig.mentions} posts, ${sig.confidence} confidence, score ${sig.score_total || "?"}`);
    parts.push(`  Tags: ${tags.join(", ")} | Communities: ${communities.join(", ")}`);

    // Include facet summaries for this signal
    const sigFacets = facets.filter(f => f.signal_id === sig.id);
    for (const f of sigFacets) {
      parts.push(`  [${f.tag}] ${f.summary || ""}`);
    }

    // Include key insights from threads
    const sigIntels = threadIntels.filter(ti => {
      const packetIds = db.prepare(
        `SELECT tp.evidence_id FROM thread_packets tp WHERE tp.thread_id = ?`
      ).all(ti.thread_id).map(r => r.evidence_id);
      const linked = db.prepare(
        `SELECT 1 FROM signal_evidence WHERE signal_id = ? AND evidence_id IN (${packetIds.map(() => "?").join(",")}) LIMIT 1`
      ).get(sig.id, ...packetIds);
      return !!linked;
    });

    if (sigIntels.length > 0) {
      parts.push(`  Thread insights (${sigIntels.length} threads analyzed):`);
      for (const ti of sigIntels.slice(0, 3)) {
        if (ti.key_insight) parts.push(`    - ${ti.key_insight}`);
      }
    }
  }

  // Cross-community patterns
  if (cases.length > 0) {
    parts.push("\n═══ CROSS-COMMUNITY PATTERNS ═══");
    for (const c of cases) {
      const memberSignals = (c.signal_ids || "").split(",");
      const memberTitles = memberSignals.map(id => {
        const s = signals.find(sig => sig.id === id);
        return s ? s.title : id;
      });
      parts.push(`\n▸ "${c.title}" — ${memberSignals.length} signals`);
      parts.push(`  ${memberTitles.join(", ")}`);
      if (c.description) parts.push(`  ${c.description}`);
    }
  }

  // Behavioral drivers (Not X, it's Y) — collected from all threads
  const allNxy = [];
  for (const ti of threadIntels) {
    const nxy = safeParseJson(ti.not_x_its_y, []);
    for (const n of nxy) {
      if (n.surface && n.deeper) allNxy.push({ ...n, community: ti.community });
    }
  }
  if (allNxy.length > 0) {
    parts.push("\n═══ BEHAVIORAL DRIVERS (Not X, it's Y) ═══");
    // Deduplicate by deeper text
    const seen = new Set();
    for (const n of allNxy) {
      const key = n.deeper.toLowerCase().slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(`▸ "${n.surface}" → "${n.deeper}" (${n.community})`);
    }
  }

  // Failed solutions — aggregated from threads and facets
  const allFailed = new Map();
  for (const ti of threadIntels) {
    const fs = safeParseJson(ti.failed_solutions, []);
    for (const f of fs) {
      if (!f.name) continue;
      const key = f.name.toLowerCase();
      if (!allFailed.has(key)) {
        allFailed.set(key, { name: f.name, reasons: [], upvotes: 0, verdict: f.verdict || "failed", count: 0 });
      }
      const entry = allFailed.get(key);
      entry.count++;
      if (f.reason) entry.reasons.push(f.reason);
      if (f.upvotes) entry.upvotes += f.upvotes;
    }
  }
  if (allFailed.size > 0) {
    parts.push("\n═══ FAILED SOLUTIONS (community-validated) ═══");
    const sorted = [...allFailed.values()].sort((a, b) => b.count - a.count);
    for (const f of sorted.slice(0, 10)) {
      const topReason = f.reasons[0] || "";
      parts.push(`▸ ${f.name} — ${f.verdict.toUpperCase()} (${f.count} mentions, ${f.upvotes} upvotes)`);
      if (topReason) parts.push(`  "${topReason}"`);
    }
  }

  // Avatar clues — from threads
  const allClues = [];
  for (const ti of threadIntels) {
    const clues = safeParseJson(ti.avatar_clues, []);
    allClues.push(...clues);
  }
  if (allClues.length > 0) {
    parts.push("\n═══ AVATAR CLUES (from real evidence) ═══");
    const seen = new Set();
    for (const c of allClues.slice(0, 8)) {
      if (seen.has(c.clue)) continue;
      seen.add(c.clue);
      parts.push(`▸ ${c.clue}${c.evidence ? " — \"" + c.evidence.slice(0, 80) + "\"" : ""}`);
    }
  }

  // Top quotes from facets (highest upvoted)
  const topQuotes = [];
  for (const f of facets) {
    const quotes = safeParseJson(f.quotes, []);
    for (const q of quotes) {
      if (q.quote && q.upvotes > 5) topQuotes.push(q);
    }
  }
  topQuotes.sort((a, b) => b.upvotes - a.upvotes);
  if (topQuotes.length > 0) {
    parts.push("\n═══ TOP QUOTES (community-validated) ═══");
    const seen = new Set();
    for (const q of topQuotes.slice(0, 10)) {
      if (seen.has(q.quote)) continue;
      seen.add(q.quote);
      parts.push(`▸ "${q.quote}" — ${q.community} (${q.upvotes} upvotes)`);
    }
  }

  // Awareness distribution
  parts.push("\n═══ AWARENESS DISTRIBUTION ═══");
  const awTotal = Object.values(awarenessDist).reduce((s, v) => s + v, 0) || 1;
  for (const [level, count] of Object.entries(awarenessDist)) {
    const pct = Math.round(count / awTotal * 100);
    parts.push(`▸ ${level.replace("_", " ")}: ${pct}% (${count} posts)`);
  }

  // The ask
  parts.push(`
═══ PRODUCE AN INTELLIGENCE BRIEF ═══

Synthesize the above findings into a brief with these EXACT sections:

## OPPORTUNITY
Is there a real market gap? What behavior change is happening? What does this predict? Be specific — name the gap.

## AVATAR
Who is this person? Build from the real avatar clues above. Age, role, daily reality, what they've tried, what stage they're at. This is a REAL person from the evidence, not a hypothesis.

## THE REAL PROBLEM
What they SAY vs what they MEAN. Use the "Not X, it's Y" findings to expose the deeper driver. Quote exact language.

## COMPETITIVE LANDSCAPE
What exists today and why it fails. Use the failed solutions data. Name names. Include upvote validation.

## MARKET POSITION
Where is this market on the awareness curve? Use the distribution data. What does this mean for positioning?

## WHAT TO BUILD
Based on the gap between what exists (failed solutions) and what people want (demand + frustration facets), what should be built first? Be specific and actionable.

## SIGNAL STRENGTH
How strong is this signal? How many independent communities confirm it? How validated are the findings? What's missing?`);

  return parts.join("\n");
}

/**
 * Generate a research brief from a topic (no evidence yet).
 * Useful for planning a new research context before running discovery.
 */
export async function generateBriefFromTopic(topic, options = {}) {
  const db = getDb();

  const prompt = fillTemplate(BRIEF_FROM_TOPIC_PROMPT, {
    topic: topic,
    description: options.description || "",
  });

  const response = await chatCompletion(SYSTEM_PROMPT, prompt, {
    model: options.model || DEFAULT_MODEL,
    max_tokens: 4096,
  });

  const briefContent = response.text;
  const briefId = crypto.randomUUID();
  const modelUsed = response.model || options.model || DEFAULT_MODEL;
  const parsed = parseBriefSections(briefContent);

  // Store — no context_id yet since this is pre-discovery
  db.prepare(`
    INSERT INTO research_briefs (id, context_id, mode, topic, brief_content, thesis, avatar, problem_language, emotional_depth, failed_solutions, awareness_verdict, desire_type, discovery_queries, evidence_count, community_count, model_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    briefId,
    options.contextId || null,
    "from_topic",
    topic,
    briefContent,
    parsed.thesis,
    parsed.avatar,
    parsed.problemLanguage,
    parsed.emotionalDepth,
    parsed.failedSolutions,
    parsed.awarenessVerdict,
    parsed.desireType,
    parsed.discoveryQueries,
    0,
    0,
    modelUsed
  );

  return {
    id: briefId,
    content: briefContent,
    parsed,
    tokensUsed: response.usage,
  };
}

/**
 * Generate a brief and use it to seed a new discovery context.
 */
export async function generateContextFromBrief(topic, options = {}) {
  const brief = await generateBriefFromTopic(topic, options);
  const parsed = brief.parsed;

  // Extract state-targeted queries from the brief
  const stateKeys = ["experiencing_pain", "tried_failed", "seeking", "found_what_works", "warning", "comparing"];
  const stateLabels = {
    experiencing_pain: "Experiencing pain", tried_failed: "Tried & failed",
    seeking: "Seeking solution", found_what_works: "What works",
    warning: "Warning others", comparing: "Comparing options",
  };
  const discoveryText = parsed.discoveryQueries || "";
  const research_passes = {};
  const allQueries = [];

  for (const state of stateKeys) {
    const label = stateLabels[state];
    const stateQueries = extractPassQueries(discoveryText, label) || [];
    research_passes[state] = {
      label,
      target_state: state,
      queries: stateQueries,
    };
    allQueries.push(...stateQueries);
  }

  // Fallback: if state-targeted parsing failed, try old 3-pass format
  if (allQueries.length === 0) {
    const pass1 = extractPassQueries(discoveryText, "Pass 1") || extractQueriesFromSection(parsed.problemLanguage) || [];
    const pass2 = extractPassQueries(discoveryText, "Pass 2") || extractQueriesFromSection(parsed.emotionalDepth) || [];
    const pass3 = extractPassQueries(discoveryText, "Pass 3") || extractQueriesFromSection(parsed.failedSolutions) || [];
    allQueries.push(...pass1, ...pass2, ...pass3);
    research_passes.experiencing_pain = { label: "Experiencing pain", target_state: "experiencing_pain", queries: pass1 };
    research_passes.tried_failed = { label: "Tried & failed", target_state: "tried_failed", queries: pass3 };
    research_passes.seeking = { label: "Seeking solution", target_state: "seeking", queries: pass2 };
  }

  // Also try to extract all queries from the section as fallback
  if (allQueries.length === 0) {
    allQueries.push(...extractQueriesFromSection(discoveryText));
  }

  const highIntent = extractHighIntent(discoveryText);
  const contextId = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/-+$/, "");

  return {
    briefId: brief.id,
    context: {
      id: contextId,
      label: topic,
      description: parsed.thesis?.slice(0, 200) || "",
      thesis: parsed.thesis || "",
      avatar: parsed.avatar || "",
      subreddits: [],
      queries: allQueries,
      high_intent: highIntent,
      research_passes,
    },
    brief: brief.content,
  };
}

// --- Parsing helpers ---

function parseBriefSections(content) {
  const sections = {};
  const sectionMap = {
    "THESIS": "thesis",
    "AVATAR": "avatar",
    "PROBLEM LANGUAGE": "problemLanguage",
    "EXPECTED PROBLEM LANGUAGE": "problemLanguage",
    "EMOTIONAL DEPTH": "emotionalDepth",
    "EXPECTED EMOTIONAL DEPTH": "emotionalDepth",
    "FAILED SOLUTIONS": "failedSolutions",
    "EXPECTED FAILED SOLUTIONS": "failedSolutions",
    "AWARENESS VERDICT": "awarenessVerdict",
    "PREDICTED AWARENESS LEVEL": "awarenessVerdict",
    "DESIRE TYPE": "desireType",
    "PREDICTED DESIRE TYPE": "desireType",
    "DISCOVERY QUERIES": "discoveryQueries",
    "DISCOVERY PLAN": "discoveryQueries",
  };

  const lines = content.split("\n");
  let currentKey = null;
  let currentLines = [];

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)/);
    if (headerMatch) {
      if (currentKey) {
        sections[currentKey] = currentLines.join("\n").trim();
      }
      const headerText = headerMatch[1].replace(/\(.*?\)/, "").trim();
      currentKey = null;
      for (const [pattern, key] of Object.entries(sectionMap)) {
        if (headerText.toUpperCase().includes(pattern)) {
          currentKey = key;
          break;
        }
      }
      currentLines = [];
    } else if (currentKey) {
      currentLines.push(line);
    }
  }
  if (currentKey) {
    sections[currentKey] = currentLines.join("\n").trim();
  }

  return sections;
}

function extractQueriesFromSection(text) {
  if (!text) return [];
  const queries = [];
  for (const line of text.split("\n")) {
    // Match quoted strings or lines starting with - or numbered items
    const quoted = line.match(/"([^"]+)"/);
    if (quoted) { queries.push(quoted[1]); continue; }
    const bulleted = line.match(/^[-*\d.]+\s+(.+)/);
    if (bulleted && bulleted[1].length > 10 && bulleted[1].length < 120) {
      queries.push(bulleted[1].replace(/^\*\*.*?\*\*\s*[-—:]\s*/, "").trim());
    }
  }
  return queries.slice(0, 15);
}

function extractPassQueries(text, passLabel) {
  if (!text) return null;
  const lines = text.split("\n");
  let inPass = false;
  const queries = [];

  for (const line of lines) {
    if (line.toLowerCase().includes(passLabel.toLowerCase())) {
      inPass = true;
      // Check if queries are on the same line (comma-separated in brackets)
      const inline = line.match(/\[(.+)\]/);
      if (inline) {
        return inline[1].split(",").map(q => q.trim().replace(/^["']|["']$/g, "")).filter(q => q.length > 5);
      }
      continue;
    }
    if (inPass) {
      if (line.match(/^(Pass|##|\*\*)/i) && !line.toLowerCase().includes(passLabel.toLowerCase())) break;
      const item = line.match(/^[-*\d.]+\s+["']?(.+?)["']?\s*$/);
      if (item) queries.push(item[1]);
    }
  }
  return queries.length > 0 ? queries : null;
}

function extractHighIntent(text) {
  if (!text) return [];
  const keywords = [];
  const lines = text.split("\n");
  let inKeywords = false;

  for (const line of lines) {
    if (line.toLowerCase().includes("high-intent") || line.toLowerCase().includes("keywords")) {
      inKeywords = true;
      const inline = line.match(/\[(.+)\]/);
      if (inline) {
        return inline[1].split(",").map(k => k.trim().replace(/^["']|["']$/g, "")).filter(k => k.length > 2);
      }
      continue;
    }
    if (inKeywords) {
      if (line.match(/^(##|\*\*|Communities|Noise)/i)) break;
      const item = line.match(/^[-*]+\s+["']?(.+?)["']?\s*$/);
      if (item) keywords.push(item[1]);
    }
  }
  return keywords;
}
