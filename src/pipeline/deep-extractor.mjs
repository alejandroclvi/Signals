/**
 * Deep Extractor — extracts behavioral drivers, failed solutions, and
 * identity-level pain from evidence packets.
 *
 * Based on the 3-pass research methodology:
 *   Pass 1: Problem language (their exact words)
 *   Pass 2: Emotional/identity depth ("Not X, it's Y")
 *   Pass 3: Failed solutions with community validation
 *
 * All extraction is regex-based for speed and transparency.
 * TODO: LLM-assist candidate — regex captures explicit patterns but misses
 * implied behavioral drivers in longer text.
 */

import crypto from "node:crypto";

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// --- Pattern sets ---

const NOT_X_ITS_Y = [
  // "it's not X, it's Y"
  /(?:it'?s not (?:about |just )?)(.*?)(?:,?\s*(?:it'?s|but)\s+)(.*?)(?:\.|$)/i,
  // "the real issue/problem is Y"
  /(?:the (?:real|actual|underlying|bigger) (?:issue|problem|reason|thing) is\s+)(.*?)(?:\.|$)/i,
  // "the worst part isn't X, it's Y"
  /(?:the (?:worst|hardest) part (?:isn'?t|wasn'?t|is not)\s+)(.*?)(?:,?\s*(?:it'?s|but)\s+)(.*?)(?:\.|$)/i,
  // "the problem isn't X, it's Y"
  /(?:the (?:problem|issue|thing) isn'?t\s+)(.*?)(?:,?\s*(?:it'?s|but)\s+)(.*?)(?:\.|$)/i,
  // "I thought X but actually Y"
  /(?:i (?:thought|assumed|expected)\s+)(.*?)(?:\s*but (?:actually|really|it turns out)\s+)(.*?)(?:\.|$)/i,
  // "everyone thinks X but really Y"
  /(?:everyone (?:thinks|says|assumes)\s+)(.*?)(?:\s*but (?:really|actually)\s+)(.*?)(?:\.|$)/i,
];

const FAILED_SOLUTION = [
  // "I tried X but it didn't/wasn't Y"
  /(?:i (?:tried|used|tested|gave\s+\S+\s+a (?:shot|try)|evaluated)\s+)(.*?)(?:\s*(?:but|and|,)\s*(?:it |didn'?t|wasn'?t|couldn'?t))(.*?)(?:\.|$)/i,
  // "switched/moved/migrated from X because Y"
  /(?:(?:moved|switched|migrated) (?:away )?from\s+)(.*?)(?:\s*(?:because|due to|since|after)\s*)(.*?)(?:\.|$)/i,
  // "gave up/stopped using/cancelled X because Y"
  /(?:(?:gave up on|stopped using|cancelled|unsubscribed from|dropped)\s+)(.*?)(?:\s*(?:because|after|when|since)\s*)(.*?)(?:\.|$)/i,
  // "wasted time/money on X and/but Y"
  /(?:(?:wasted|spent) (?:time|hours|days|weeks|money|\$\d+) (?:on|with|trying)\s+)(.*?)(?:\s*(?:and|but|only to)\s*)(.*?)(?:\.|$)/i,
];

const PROBLEM_LANGUAGE = [
  // "I'm struggling/drowning/stuck with X"
  /(?:i(?:'m| am) (?:struggling|drowning|stuck|lost|confused) (?:with |on |about )?)(.*?)(?:\.|$)/i,
  // "my biggest problem/frustration is X"
  /(?:(?:the|my) (?:biggest|main|worst|core) (?:problem|issue|pain point|frustration|blocker) (?:is|was)\s+)(.*?)(?:\.|$)/i,
  // "I can't figure out/get/make X"
  /(?:i (?:can'?t|cannot|couldn'?t) (?:figure out|get|make|understand|find)\s+)(.*?)(?:\.|$)/i,
  // "it takes forever/hours to X"
  /(?:(?:it|this) (?:takes|took) (?:forever|hours|days|way too long) to\s+)(.*?)(?:\.|$)/i,
  // "every time/day I have to X"
  /(?:every (?:time|day|week|morning) i (?:have to|need to|end up)\s+)(.*?)(?:\.|$)/i,
];

const IDENTITY_STATEMENT = [
  // "as a X, I Y"
  /(?:(?:as a|being a|as an)\s+)(.*?)(?:,?\s*(?:i|it|this)\s+)(.*?)(?:\.|$)/i,
  // "I refuse/stopped/gave up X"
  /(?:i (?:refuse to|stopped|quit|gave up)\s+)(.*?)(?:\.|$)/i,
  // "I shouldn't have to X"
  /(?:i (?:shouldn'?t have to|don'?t want to|am tired of having to|am sick of)\s+)(.*?)(?:\.|$)/i,
  // "I'm not the kind of person who X"
  /(?:i(?:'m| am) (?:not )?(?:a|the kind of)\s+)(.*?)(?:\.|,|$)/i,
];

/**
 * Extract deep patterns from a set of evidence packets.
 * Returns an array of extraction objects ready for DB insertion.
 */
export function extractDeepPatterns(packets) {
  const extractions = [];

  for (const packet of packets) {
    const text = ((packet.title || "") + " " + (packet.body || "")).trim();
    if (!text || text.length < 20) continue;

    const metrics = safeParseJson(packet.metrics, {});
    const upvotes = metrics.score || 0;
    const baseConfidence = 0.4 + Math.min(0.4, upvotes / 50);

    // Not X, it's Y
    for (const regex of NOT_X_ITS_Y) {
      const match = text.match(regex);
      if (match) {
        // Some patterns have 1 capture (deeper only), some have 2 (surface + deeper)
        const surface = match[2] ? match[1].trim() : null;
        const deeper = (match[2] || match[1]).trim();
        if (deeper.length > 5 && deeper.length < 300) {
          extractions.push({
            id: crypto.randomUUID(),
            evidence_id: packet.id,
            extraction_type: "not_x_its_y",
            surface_text: surface && surface.length > 3 ? surface.slice(0, 200) : null,
            deeper_text: deeper.slice(0, 200),
            confidence: Math.min(1.0, baseConfidence + 0.15),
            upvotes,
          });
        }
        break; // one extraction per type per packet
      }
    }

    // Failed solutions
    for (const regex of FAILED_SOLUTION) {
      const match = text.match(regex);
      if (match && match[1]) {
        const solution = match[1].trim();
        const reason = (match[2] || "").trim();
        if (solution.length > 2 && solution.length < 200) {
          extractions.push({
            id: crypto.randomUUID(),
            evidence_id: packet.id,
            extraction_type: "failed_solution",
            surface_text: solution.slice(0, 200),
            deeper_text: reason.length > 3 ? reason.slice(0, 200) : null,
            confidence: Math.min(1.0, baseConfidence + 0.1),
            upvotes,
          });
        }
        break;
      }
    }

    // Problem language
    for (const regex of PROBLEM_LANGUAGE) {
      const match = text.match(regex);
      if (match && match[1]) {
        const problem = match[1].trim();
        if (problem.length > 5 && problem.length < 300) {
          extractions.push({
            id: crypto.randomUUID(),
            evidence_id: packet.id,
            extraction_type: "problem_language",
            surface_text: problem.slice(0, 200),
            deeper_text: null,
            confidence: baseConfidence,
            upvotes,
          });
        }
        break;
      }
    }

    // Identity statements
    for (const regex of IDENTITY_STATEMENT) {
      const match = text.match(regex);
      if (match && match[1]) {
        const identity = match[1].trim();
        const continuation = (match[2] || "").trim();
        if (identity.length > 3 && identity.length < 200) {
          extractions.push({
            id: crypto.randomUUID(),
            evidence_id: packet.id,
            extraction_type: "identity_statement",
            surface_text: identity.slice(0, 200),
            deeper_text: continuation.length > 3 ? continuation.slice(0, 200) : null,
            confidence: Math.min(1.0, baseConfidence + 0.1),
            upvotes,
          });
        }
        break;
      }
    }
  }

  return extractions;
}

/**
 * Classify desire type at the signal level.
 *
 * Mass instinct: primal/discovery demand (protect, be healthy, avoid pain).
 *   Appears when people are unaware/problem-aware.
 *
 * Mass technological: desires born from negative experiences with existing
 *   solutions ("I want a version that doesn't have [specific flaw]").
 *   Appears when people are product-aware.
 */
// TODO: LLM-assist candidate — keyword scoring misses nuanced frustration patterns
export function classifyDesireType(packets, awarenessDistribution, extractions) {
  const text = packets.map(p => ((p.title || "") + " " + (p.body || "")).toLowerCase()).join(" ");

  let techScore = 0;
  let instinctScore = 0;

  // Text indicators
  if (/\b(switch(?:ing|ed) from|replac(?:ing|ed)|fed up with|alternative to|migrat(?:ing|ed)|moved away from|dropped|cancelled)\b/.test(text)) techScore += 2;
  if (/\b(discover(?:ed|ing)|just found|til\b|game changer|didn'?t know (?:this |about )|never heard|first time)\b/.test(text)) instinctScore += 2;

  // Awareness distribution signals
  const aw = awarenessDistribution || {};
  const productAware = (aw.product_aware || 0) + (aw.most_aware || 0);
  const earlyAware = (aw.unaware || 0) + (aw.problem_aware || 0);
  if (productAware > earlyAware) techScore += 2;
  if (earlyAware > productAware) instinctScore += 2;

  // Intent composition
  const intentCounts = {};
  for (const p of packets) {
    const intent = p.intent || "question";
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  }
  const total = packets.length || 1;
  if (((intentCounts.comparison || 0) + (intentCounts.pain || 0)) / total > 0.4) techScore += 1;
  if ((intentCounts.question || 0) / total > 0.4) instinctScore += 1;

  // Failed solution extractions
  const failedCount = (extractions || []).filter(e => e.extraction_type === "failed_solution").length;
  if (failedCount >= 2) techScore += 2;
  else if (failedCount === 0) instinctScore += 1;

  // Named incumbents being criticized (proper-noun-ish words near negative sentiment)
  if (/\b[A-Z][a-z]+(?:\.(?:io|ai|com))?\b/.test(packets.map(p => (p.body || "")).join(" ")) &&
      /\b(sucks?|terrible|awful|broken|overpriced|worse|disappointing)\b/i.test(text)) {
    techScore += 1;
  }

  if (techScore > instinctScore) return "mass_technological";
  if (instinctScore > techScore) return "mass_instinct";
  return "mass_instinct"; // tie → safer default for early signals
}

/**
 * Aggregate failed solution extractions into a ranked list.
 * Groups by solution name (lowercase, trimmed), counts occurrences,
 * sums upvote validation.
 */
export function aggregateFailedSolutions(extractions) {
  const failed = extractions.filter(e => e.extraction_type === "failed_solution");
  if (!failed.length) return [];

  const groups = new Map();
  for (const ext of failed) {
    const key = (ext.surface_text || "").toLowerCase().trim().slice(0, 80);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, { name: ext.surface_text, count: 0, validation: 0, reasons: [] });
    }
    const g = groups.get(key);
    g.count++;
    g.validation += ext.upvotes || 0;
    if (ext.deeper_text) g.reasons.push(ext.deeper_text);
  }

  return [...groups.values()]
    .sort((a, b) => (b.validation + b.count * 10) - (a.validation + a.count * 10))
    .slice(0, 10)
    .map(g => ({
      name: g.name,
      count: g.count,
      validation: g.validation,
      top_reason: g.reasons[0] || null,
    }));
}
