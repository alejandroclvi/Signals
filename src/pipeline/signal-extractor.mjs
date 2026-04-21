/**
 * Signal Extractor — groups evidence packets into candidate signals.
 *
 * Grouping logic:
 * - Evidence packets share a query/topic → group into one candidate signal
 * - Computes volume, velocity, community spread, phrase frequency
 * - Runs deep extraction for behavioral drivers, failed solutions, desire type
 * - Does NOT score — that's the scorer's job
 */

import { extractDeepPatterns, classifyDesireType, aggregateFailedSolutions } from "./deep-extractor.mjs";
import { getDb } from "../db/connection.mjs";
import { getCachedThemeLabels } from "./theme-labeler.mjs";

function stableId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/**
 * Extract candidate signals from evidence packets.
 * Returns { signals: [], signalEvidence: Map<signalId, evidenceId[]> }
 */
export function extractSignals(evidencePackets, contextId, options = {}) {
  const db = getDb();
  const context = db.prepare("SELECT grouping_mode, research_passes FROM contexts WHERE id = ?").get(contextId);
  const groupingMode = options.groupingMode || context?.grouping_mode || "community";

  const groups = new Map();

  if (groupingMode === "theme") {
    // Group by THEME — multiple queries can map to the same theme.
    // Evidence from "regret convincing team" and "switched to Penpot" both
    // go into the "Regret & switching" signal.
    const passes = safeParseJson(context?.research_passes, null);
    const llmLabels = getCachedThemeLabels(contextId);
    const queryToTheme = buildQueryThemeMap(passes, llmLabels);

    for (const ep of evidencePackets) {
      const topics = safeParseJson(ep.topics, []);
      const query = topics[0] || "general";
      const theme = queryToTheme.get(query) || llmLabels[query] || deriveTheme(query, "");
      const key = stableId(theme); // same theme → same key → merged
      if (!key) continue;
      if (!groups.has(key)) {
        groups.set(key, { topic: theme, key, packets: [] });
      }
      groups.get(key).packets.push(ep);
    }
  } else {
    // Group by COMMUNITY — each subreddit is a distinct conversation context.
    // Used for market research where different communities = different signals.
    for (const ep of evidencePackets) {
      const community = ep.community || "unknown";
      const key = stableId(community);
      if (!key) continue;
      if (!groups.has(key)) {
        groups.set(key, { topic: community, key, packets: [] });
      }
      groups.get(key).packets.push(ep);
    }
  }

  // Convert groups to candidate signals
  const signals = [];
  const signalEvidence = new Map();
  let rank = 0;

  // Sort by packet count descending
  const sorted = [...groups.values()].sort((a, b) => b.packets.length - a.packets.length);

  for (const group of sorted) {
    if (group.packets.length < 1) continue;
    rank++;

    const signalId = "live:" + group.key;
    const packets = group.packets;

    // Compute metrics
    const communities = [...new Set(packets.map(p => p.community).filter(Boolean))];
    const authors = [...new Set(packets.map(p => p.author_ref).filter(Boolean))];
    const totalComments = packets.reduce((sum, p) => {
      const m = safeParseJson(p.metrics, {});
      return sum + (m.comments || 0);
    }, 0);
    const totalScore = packets.reduce((sum, p) => {
      const m = safeParseJson(p.metrics, {});
      return sum + (m.score || 0);
    }, 0);

    // Phrase extraction — simple word-pair frequency from titles and bodies
    const phrases = extractPhrases(packets);

    // Community spread
    const spread = communities.map(c => {
      const count = packets.filter(p => p.community === c).length;
      return [c, Math.round((count / packets.length) * 100)];
    }).sort((a, b) => b[1] - a[1]);

    // Compute multi-factor signal status
    const status = computeSignalStatus(packets, communities, authors, contextId);

    // Confidence based on evidence breadth
    let confidence = "Low";
    if (packets.length >= 3 && communities.length >= 2) confidence = "Medium";
    if (packets.length >= 6 && communities.length >= 3 && authors.length >= 4) confidence = "High";

    // Classify signal tags once
    const tags = classifyTags(packets);

    // Intent composition — count evidence by intent type
    const intentCounts = {};
    for (const p of packets) {
      const intent = p.intent || "question";
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
    }
    const dominantIntent = Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "question";

    // Awareness distribution — count evidence by awareness level
    const awarenessCounts = {};
    for (const p of packets) {
      const level = p.awareness_level || "problem_aware";
      awarenessCounts[level] = (awarenessCounts[level] || 0) + 1;
    }
    const dominantAwareness = Object.entries(awarenessCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "problem_aware";

    // Sentiment distribution — count evidence by sentiment
    const sentimentCounts = {};
    for (const p of packets) {
      const s = p.sentiment || "neutral";
      sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;
    }
    const dominantSentiment = Object.entries(sentimentCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";

    // Evidence state distribution
    const stateCounts = {};
    for (const p of packets) {
      const s = p.evidence_state || "sharing_insight";
      stateCounts[s] = (stateCounts[s] || 0) + 1;
    }
    const dominantState = Object.entries(stateCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "sharing_insight";

    // Deep extraction — behavioral drivers, failed solutions, identity pain
    const deepExtractions = extractDeepPatterns(packets);
    const desireType = classifyDesireType(packets, awarenessCounts, deepExtractions);
    const failedSolutions = aggregateFailedSolutions(deepExtractions);

    // Top extractions by confidence (prioritize not_x_its_y and identity_statement)
    const topExtractions = deepExtractions
      .sort((a, b) => {
        const typePriority = { not_x_its_y: 4, identity_statement: 3, failed_solution: 2, problem_language: 1 };
        const aPri = typePriority[a.extraction_type] || 0;
        const bPri = typePriority[b.extraction_type] || 0;
        if (aPri !== bPri) return bPri - aPri;
        return b.confidence - a.confidence;
      })
      .slice(0, 5)
      .map(e => ({
        type: e.extraction_type,
        surface: e.surface_text,
        deeper: e.deeper_text,
        confidence: e.confidence,
        upvotes: e.upvotes,
      }));

    // Merge LLM thread intelligence extractions (if available)
    const llmExtractions = getThreadIntelExtractions(packets);
    if (llmExtractions.length > 0) {
      // Add LLM not_x_its_y that regex missed (deduplicated)
      for (const llm of llmExtractions.notXItsY) {
        const alreadyHas = topExtractions.some(e =>
          e.type === "not_x_its_y" && textOverlap(e.surface + " " + e.deeper, llm.surface + " " + llm.deeper) > 0.3
        );
        if (!alreadyHas && topExtractions.length < 8) {
          topExtractions.push({ type: "not_x_its_y", surface: llm.surface, deeper: llm.deeper, confidence: llm.confidence || 0.7, upvotes: 0, source: "llm" });
        }
      }
      // Merge LLM failed solutions into aggregated list
      for (const llm of llmExtractions.failedSolutions) {
        const exists = failedSolutions.some(f => f.name.toLowerCase() === (llm.name || "").toLowerCase());
        if (!exists && llm.name) {
          failedSolutions.push({ name: llm.name, count: 1, validation: llm.upvotes || 0, verdict: llm.verdict || "failed", source: "llm" });
        }
      }
    }

    // Bubble position — higher rank = upper-right quadrant
    const x = Math.min(780, 400 + Math.round(packets.length * 18 + communities.length * 30));
    const y = Math.max(60, 400 - Math.round(packets.length * 22 + totalComments * 0.3));
    const r = Math.max(16, Math.min(44, 16 + packets.length * 3));

    // Build a descriptive title from the community + top phrases
    const topPhrase = phrases.length > 0 ? phrases[0][0] : "";
    const signalTitle = topPhrase
      ? group.topic + ": " + topPhrase
      : group.topic;

    const signal = {
      id: signalId,
      context_id: contextId,
      rank,
      status,
      title: signalTitle,
      growth: "+ live",
      tags: JSON.stringify(tags),
      summary: buildSummary(group.topic, packets, communities),
      communities: JSON.stringify(communities),
      mentions: packets.length,
      comments: totalComments,
      confidence,
      volume: totalScore + totalComments,
      why: "This signal was extracted from live Reddit evidence. " +
        packets.length + " posts across " + communities.length + " communities with " +
        authors.length + " unique authors.",
      suggested_title: "Suggested action",
      suggested_sub: "Inspect evidence and enable additional sources for corroboration.",
      next_source: recommendNextSource(tags),
      dominant_intent: dominantIntent,
      intent_mix: JSON.stringify(intentCounts),
      sentiment_distribution: JSON.stringify(sentimentCounts),
      dominant_sentiment: dominantSentiment,
      state_distribution: JSON.stringify(stateCounts),
      dominant_state: dominantState,
      awareness_distribution: JSON.stringify(awarenessCounts),
      dominant_awareness: dominantAwareness,
      desire_type: desireType,
      top_extractions: JSON.stringify(topExtractions),
      failed_solutions: JSON.stringify(failedSolutions),
      bubble_x: x,
      bubble_y: y,
      bubble_r: r,
    };

    signals.push(signal);
    signalEvidence.set(signalId, packets.map(p => p.id));

    // Attach phrases, spread, and extractions for later insertion
    signal._phrases = phrases;
    signal._spread = spread;
    signal._deepExtractions = deepExtractions;
  }

  return { signals, signalEvidence };
}

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function extractPhrases(packets) {
  const freq = new Map();
  for (const p of packets) {
    const text = ((p.title || "") + " " + (p.body || "")).toLowerCase();
    // Extract 2-3 word phrases
    const words = text.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = words[i] + " " + words[i + 1];
      freq.set(bigram, (freq.get(bigram) || 0) + 1);
      if (i < words.length - 2) {
        const trigram = bigram + " " + words[i + 2];
        freq.set(trigram, (freq.get(trigram) || 0) + 1);
      }
    }
  }

  // Filter stopword-heavy phrases and sort by frequency
  const stopwords = new Set([
    "the", "and", "for", "that", "this", "with", "are", "was", "has", "have",
    "but", "not", "you", "can", "any", "all", "from", "been", "will", "its",
    "they", "their", "them", "than", "then", "what", "when", "where", "which",
    "who", "how", "why", "did", "does", "don", "didn", "doesn", "won", "wouldn",
    "could", "would", "should", "just", "like", "also", "really", "very", "much",
    "even", "still", "about", "into", "more", "most", "some", "only", "over",
    "such", "own", "same", "being", "here", "there", "every", "each", "both",
    "many", "well", "way", "get", "got", "one", "two", "out", "now", "new",
    "make", "made", "use", "used", "know", "think", "want", "need", "see",
    "say", "said", "come", "going", "thing", "things", "people", "right",
    "good", "time", "year", "years", "day", "days", "lot", "back", "first",
    "last", "long", "work", "take", "too", "her", "his", "she", "him", "our",
    "your", "my", "had", "were", "been", "other", "after", "before", "because",
    "those", "these", "while", "through", "between", "might", "another",
    "something", "anything", "everything", "nothing", "someone", "everyone",
    "always", "never", "often", "already", "keep", "let", "put", "went",
    "comment", "post", "reddit", "edit", "deleted", "removed", "http", "https",
  ]);
  return [...freq.entries()]
    .filter(([phrase, count]) => {
      if (count < 2) return false;
      const words = phrase.split(" ");
      const meaningful = words.filter(w => !stopwords.has(w));
      return meaningful.length >= Math.ceil(words.length * 0.6);
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase, count]) => [phrase, count]);
}

function classifyTags(packets) {
  const text = packets.map(p => ((p.title || "") + " " + (p.body || "")).toLowerCase()).join(" ");
  const tags = [];

  // Simple keyword-based classification
  if (/alternative|switch|replace|instead of|better than|compared to/i.test(text)) tags.push("comparison");
  if (/frustrat|annoying|hate|terrible|worst|broken|expensive|overpriced/i.test(text)) tags.push("frustration");
  if (/need|want|looking for|is there|how do i|any tool|recommend/i.test(text)) tags.push("demand");
  if (/started using|switched to|workflow|integrated|set up|using .* daily/i.test(text)) tags.push("adoption");
  if (/hiring|budget|pricing|pay for|cost|revenue|jobs/i.test(text)) tags.push("economic");
  if (/everyone is|people are now|used to think|narrative|trend/i.test(text)) tags.push("narrative");

  if (!tags.length) tags.push("demand");
  return tags.slice(0, 3);
}

/**
 * Recommend the best next source to enable based on signal tags.
 *
 * Reddit covers the "conversation" evidence layer. Each tag type
 * benefits most from a specific missing layer:
 *
 *   frustration/demand → intent (Google Search)
 *   adoption/comparison → behavior (GitHub)
 *   economic → economic commitment (job boards, procurement)
 *   narrative → primary truth (official sources, filings)
 *
 * Returns a human-readable recommendation string.
 */
function recommendNextSource(tags) {
  const recs = [
    {
      tags: ["demand", "frustration"],
      weight: 10,
      source: "Google Search",
      layer: "intent",
      reason: "validate whether this conversation is turning into active search and comparison behavior",
    },
    {
      tags: ["adoption", "comparison"],
      weight: 10,
      source: "GitHub",
      layer: "behavior",
      reason: "check for implementation artifacts, repos, and developer adoption signals",
    },
    {
      tags: ["economic"],
      weight: 10,
      source: "Job boards & procurement signals",
      layer: "economic commitment",
      reason: "look for hiring patterns, budget mentions, and procurement activity that confirm economic intent",
    },
    {
      tags: ["narrative"],
      weight: 10,
      source: "Primary sources (official docs, filings)",
      layer: "primary truth",
      reason: "verify whether the narrative is backed by official statements, filings, or vendor announcements",
    },
  ];

  // Score each recommendation by how many of its tags match the signal
  let best = null;
  let bestScore = 0;

  for (const rec of recs) {
    const matchCount = rec.tags.filter(t => tags.includes(t)).length;
    if (matchCount > 0) {
      const score = matchCount * rec.weight;
      if (score > bestScore) {
        bestScore = score;
        best = rec;
      }
    }
  }

  if (best) {
    return "Enable " + best.source + " to " + best.reason + ". Reddit provides conversation evidence but cannot prove " + best.layer + ".";
  }

  return "Enable Google Search to validate whether this conversation signal is driving active discovery intent. Reddit alone provides conversation but not intent or behavior evidence.";
}

function buildSummary(topic, packets, communities) {
  const commStr = communities.slice(0, 3).join(", ");
  if (packets.length >= 5) {
    return "Active discussion around \"" + topic + "\" across " + commStr + " with " + packets.length + " posts showing repeated interest.";
  }
  return "Early evidence of interest in \"" + topic + "\" appearing in " + commStr + ".";
}

/**
 * Build a map from query string → human-readable theme label.
 * Uses research_passes if available, otherwise derives from the query itself.
 */
function buildQueryThemeMap(passes, llmLabels = {}) {
  const map = new Map();
  if (!passes) return map;

  for (const [passKey, pass] of Object.entries(passes)) {
    const passLabel = pass.label || passKey;
    for (const query of (pass.queries || [])) {
      // Prefer LLM-generated labels, fall back to keyword extraction
      const theme = llmLabels[query] || deriveTheme(query, passLabel);
      map.set(query, theme);
    }
  }
  return map;
}

/**
 * Derive a human-readable theme from a query string.
 * Uses LLM-generated labels if cached, otherwise falls back to keyword extraction.
 */
function deriveTheme(query, passLabel) {
  const q = query.toLowerCase();
  const cleaned = q
    .replace(/\b(reddit|site:reddit\.com|i'm|i've|i|the|a|an|is|are|was|it|to|on|in|of|for|and|but|so|my|our|we|every|always|completely|actually|just|really|too|very|still|time|been)\b/g, "")
    .replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(w => w.length > 2).slice(0, 3);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || query.slice(0, 30);
}

/**
 * Compute signal status using multiple factors instead of just packet count.
 *
 * Factors:
 *   - Volume (diminishing returns, capped at 25)
 *   - Community spread (strong signal)
 *   - Author diversity
 *   - Evidence quality (average weight)
 *   - Thread intelligence coverage
 *
 * Produces: Watch | Growing | Emerging
 */
function computeSignalStatus(packets, communities, authors, contextId) {
  let score = 0;

  // Volume (diminishing returns — first 10 packets matter most)
  score += Math.min(25, packets.length * 2.5);

  // Community spread — multiple communities is a strong signal
  score += Math.min(24, communities.length * 8);

  // Author diversity — more unique voices = more signal
  score += Math.min(15, authors.length * 2);

  // Evidence quality — average weight > 1.5 means highly upvoted content
  const avgWeight = packets.reduce((sum, p) => sum + (p.evidence_weight || 1), 0) / packets.length;
  if (avgWeight >= 1.8) score += 12;
  else if (avgWeight >= 1.3) score += 6;

  // Thread intelligence coverage (LLM has confirmed patterns)
  const db = getDb();
  const threadIds = [...new Set(packets.map(p => p.thread_id).filter(Boolean))];
  if (threadIds.length > 0) {
    const placeholders = threadIds.map(() => "?").join(",");
    const intelCount = db.prepare(
      `SELECT COUNT(*) as c FROM thread_intelligence WHERE thread_id IN (${placeholders}) AND signal_quality IN ('high', 'medium')`
    ).get(...threadIds).c;
    if (intelCount >= 3) score += 12;
    else if (intelCount >= 1) score += 6;
  }

  if (score >= 55) return "Emerging";
  if (score >= 30) return "Growing";
  return "Watch";
}

/**
 * Get LLM thread intelligence extractions for packets in this signal.
 * Queries thread_intelligence via packet thread_ids.
 */
function getThreadIntelExtractions(packets) {
  const db = getDb();
  const threadIds = [...new Set(packets.map(p => p.thread_id).filter(Boolean))];
  if (threadIds.length === 0) return [];

  const placeholders = threadIds.map(() => "?").join(",");
  const intels = db.prepare(
    `SELECT not_x_its_y, failed_solutions FROM thread_intelligence WHERE thread_id IN (${placeholders}) AND signal_quality != 'noise'`
  ).all(...threadIds);

  if (intels.length === 0) return [];

  const notXItsY = [];
  const failedSolutions = [];

  for (const ti of intels) {
    const nxy = safeParseJson(ti.not_x_its_y, []);
    notXItsY.push(...nxy);
    const fs = safeParseJson(ti.failed_solutions, []);
    failedSolutions.push(...fs);
  }

  return { notXItsY, failedSolutions, length: notXItsY.length + failedSolutions.length };
}

/**
 * Simple word overlap check (for deduplication).
 */
function textOverlap(a, b) {
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}
