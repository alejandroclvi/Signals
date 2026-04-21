/**
 * Facet Synthesizer — turns flat tags into evidence-backed intelligence.
 *
 * For each tag on each signal, filters evidence packets to those matching
 * the tag's criteria, aggregates thread intelligence, and produces:
 *   - Top quotes by upvotes
 *   - "Not X, it's Y" behavioral drivers
 *   - Failed solutions
 *   - Avatar clues
 *   - Awareness level
 *   - One-sentence summary
 *
 * No LLM calls — pure aggregation of existing data.
 */

import { getDb } from "../db/connection.mjs";
import { createUnit, getExtractionIds } from "./intelligence-chain.mjs";

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// Tag → evidence filter patterns (inverted from classifyTags in signal-extractor.mjs)
const TAG_FILTERS = {
  frustration: /frustrat|annoying|hate|terrible|worst|broken|expensive|overpriced|garbage|useless|waste|nightmare|headache/i,
  demand: /need|want|looking for|is there|how do i|any tool|recommend|wish there was|built my own|anyone found|how do you/i,
  comparison: /alternative|switch|replace|instead of|better than|compared to|vs\.?|versus|moved from|switched from/i,
  adoption: /started using|switched to|workflow|integrated|set up|using .* daily|been using|migrated to/i,
  economic: /hiring|budget|pricing|pay for|cost|revenue|jobs|salary|funding|investment|paying|subscription/i,
  narrative: /everyone is|people are now|used to think|narrative|trend|shifting|changing|prediction/i,
};

// Summary generators per tag
const SUMMARY_GENERATORS = {
  frustration(f) {
    let s = f.evidence_count + " posts expressing frustration";
    if (f.failed_solutions.length) s += " about " + f.failed_solutions.slice(0, 2).map(x => x.name).join(", ");
    if (f.not_x_its_y.length) s += ". Core driver: \u201c" + f.not_x_its_y[0].deeper.slice(0, 80) + "\u201d";
    return s;
  },
  demand(f) {
    let s = f.evidence_count + " posts seeking solutions";
    if (f.awareness_level) s += ". Awareness: " + f.awareness_level.replace("_", " ");
    if (f.quotes.length) s += ". \u201c" + f.quotes[0].quote.slice(0, 70) + "\u2026\u201d";
    return s;
  },
  comparison(f) {
    const names = f.failed_solutions.map(x => x.name).slice(0, 3).join(", ");
    let s = "Comparing " + (names || "tools");
    s += ". " + f.evidence_count + " posts, " + f.total_upvotes + " upvotes";
    return s;
  },
  adoption(f) {
    let s = f.evidence_count + " posts about tool adoption";
    if (f.quotes.length) s += ". \u201c" + f.quotes[0].quote.slice(0, 70) + "\u2026\u201d";
    return s;
  },
  economic(f) {
    return f.evidence_count + " posts with economic signals (budget, pricing, hiring)";
  },
  narrative(f) {
    let s = f.evidence_count + " posts reflecting shifting narrative";
    if (f.not_x_its_y.length) s += ". \u201c" + f.not_x_its_y[0].surface.slice(0, 30) + "\u201d \u2192 \u201c" + f.not_x_its_y[0].deeper.slice(0, 30) + "\u201d";
    return s;
  },
};

function defaultSummary(f) {
  return f.evidence_count + " posts tagged " + f.tag + " (" + f.total_upvotes + " upvotes)";
}

/**
 * Extract a short quote from evidence body text.
 */
function extractQuote(body, maxLen) {
  if (!body) return null;
  // Take first sentence or first N chars
  const clean = body.replace(/\n+/g, " ").trim();
  const sentence = clean.match(/^[^.!?]+[.!?]/);
  const raw = sentence ? sentence[0] : clean;
  return raw.length > maxLen ? raw.slice(0, maxLen) + "\u2026" : raw;
}

/**
 * Synthesize facets for all signals in a context.
 * Returns number of facets written.
 */
export function synthesizeFacets(contextId) {
  const db = getDb();

  const signals = db.prepare(
    `SELECT id, tags FROM signals WHERE context_id = ? AND dismissed = 0`
  ).all(contextId);

  if (signals.length === 0) return 0;

  const upsertFacet = db.prepare(`
    INSERT OR REPLACE INTO signal_facets
    (signal_id, tag, evidence_count, thread_count, total_upvotes, quotes, not_x_its_y, failed_solutions, avatar_clues, awareness_level, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let facetCount = 0;

  const run = db.transaction(() => {
    for (const signal of signals) {
      const tags = safeParseJson(signal.tags, []);
      if (tags.length === 0) continue;

      // Get all evidence packets for this signal
      const packets = db.prepare(`
        SELECT ep.* FROM evidence_packets ep
        JOIN signal_evidence se ON se.evidence_id = ep.id
        WHERE se.signal_id = ?
      `).all(signal.id);

      if (packets.length === 0) continue;

      for (const tag of tags) {
        const filter = TAG_FILTERS[tag];

        // Filter packets matching this tag's criteria
        const matching = filter
          ? packets.filter(p => {
              const text = ((p.title || "") + " " + (p.body || ""));
              return filter.test(text);
            })
          : packets; // unknown tag → use all packets

        if (matching.length === 0) continue;

        // Compute metrics
        const totalUpvotes = matching.reduce((sum, p) => {
          const m = safeParseJson(p.metrics, {});
          return sum + (m.score || 0);
        }, 0);

        // Top quotes by upvotes
        const quoteCandidates = matching
          .map(p => {
            const m = safeParseJson(p.metrics, {});
            const isComment = (p.source_item_id || "").startsWith("t1_");
            return {
              quote: extractQuote(p.body, 120),
              speaker: p.author_ref || "anonymous",
              upvotes: m.score || 0,
              community: p.community || "",
              url: p.url || null,
              type: isComment ? "comment" : "post",
            };
          })
          .filter(q => q.quote && q.quote.length > 20)
          .sort((a, b) => b.upvotes - a.upvotes)
          .slice(0, 3);

        // Get thread intelligence for matching packets
        const threadIds = [...new Set(matching.map(p => p.thread_id).filter(Boolean))];
        let allNxy = [];
        let allFailed = [];
        let allClues = [];

        if (threadIds.length > 0) {
          const placeholders = threadIds.map(() => "?").join(",");
          const intels = db.prepare(
            `SELECT not_x_its_y, failed_solutions, avatar_clues FROM thread_intelligence
             WHERE thread_id IN (${placeholders}) AND signal_quality != 'noise'`
          ).all(...threadIds);

          for (const ti of intels) {
            const nxy = safeParseJson(ti.not_x_its_y, []);
            allNxy.push(...nxy);
            const fs = safeParseJson(ti.failed_solutions, []);
            allFailed.push(...fs);
            const clues = safeParseJson(ti.avatar_clues, []);
            allClues.push(...clues);
          }
        }

        // Deduplicate failed solutions by name
        const failedMap = new Map();
        for (const f of allFailed) {
          if (f.name) {
            const key = f.name.toLowerCase();
            if (!failedMap.has(key)) failedMap.set(key, f);
          }
        }
        const dedupedFailed = [...failedMap.values()].slice(0, 5);

        // Dominant awareness level
        const awCounts = {};
        for (const p of matching) {
          const aw = p.awareness_level || "problem_aware";
          awCounts[aw] = (awCounts[aw] || 0) + 1;
        }
        const awareness = Object.entries(awCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        // Build facet object for summary generation
        const facet = {
          tag,
          evidence_count: matching.length,
          thread_count: threadIds.length,
          total_upvotes: totalUpvotes,
          quotes: quoteCandidates,
          not_x_its_y: allNxy.slice(0, 3),
          failed_solutions: dedupedFailed,
          avatar_clues: allClues.slice(0, 3),
          awareness_level: awareness,
        };

        // Generate summary
        const generator = SUMMARY_GENERATORS[tag] || defaultSummary;
        const summary = generator(facet);

        upsertFacet.run(
          signal.id,
          tag,
          facet.evidence_count,
          facet.thread_count,
          facet.total_upvotes,
          JSON.stringify(facet.quotes),
          JSON.stringify(facet.not_x_its_y),
          JSON.stringify(facet.failed_solutions),
          JSON.stringify(facet.avatar_clues),
          facet.awareness_level,
          summary
        );

        // Intelligence chain: create L2 cross_thread unit for facets with 2+ threads
        if (facet.thread_count >= 2) {
          try {
            const parentIds = getExtractionIds(threadIds);
            createUnit({
              unitType: "cross_thread",
              claim: summary,
              sourceType: "facet", sourceId: signal.id + ":" + tag,
              method: "aggregation",
              parentIds,
              contextId, signalId: signal.id,
              confidence: Math.min(0.9, 0.4 + facet.thread_count * 0.1),
              confidenceBasis: facet.thread_count + " threads, " + facet.evidence_count + " posts",
              createdBy: "facet-synthesizer",
            });
          } catch (e) { /* chain is non-blocking */ }
        }

        facetCount++;
      }
    }
  });

  run();
  return facetCount;
}
