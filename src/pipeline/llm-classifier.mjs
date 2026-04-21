/**
 * LLM Micro-Classifier — replaces regex classifiers with cheap batched LLM calls.
 *
 * Sends batches of evidence packets to Gemini Flash via OpenRouter
 * and gets back structured classifications:
 *   - evidence_state (8 values)
 *   - intent (5 values)
 *   - awareness_level (5 values)
 *   - sentiment (4 values)
 *
 * Cost: ~$0.003 per batch of 20 packets (~$0.15 per 1000 packets).
 * Latency: ~1-2s per batch, 3 concurrent = ~1000 packets/minute.
 *
 * Falls back to regex classifiers on API failure (never blocks ingestion).
 */

import "../lib/env.mjs";
import {
  classifyEvidenceState,
  classifyIntent,
  classifyAwareness,
  classifySentiment,
} from "./normalizer.mjs";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "google/gemini-2.0-flash-001";
const BATCH_SIZE = 20;
const CONCURRENCY = 1;
const DELAY_BETWEEN_BATCHES_MS = 1500;

const SYSTEM_PROMPT = `You classify Reddit evidence into structured categories. Return ONLY valid JSON.

For each item, classify ALL FOUR dimensions:

evidence_state (what is this evidence doing?):
- promoting: selling their own product
- comparing: structured comparison of options
- tried_failed: used something specific, it didn't work
- warning: telling others to avoid something
- seeking: actively looking for a solution
- found_what_works: positive experience with specific tool
- sharing_insight: sharing knowledge or experience
- experiencing_pain: describing frustration without mentioning tools

intent (what action are they taking?):
- pain: expressing frustration or complaint
- promotion: showing off something they built
- insight: sharing knowledge or experience
- question: asking for help or recommendations
- comparison: comparing tools or approaches

awareness_level (how much do they know?):
- unaware: don't know they have a problem
- problem_aware: know the problem, exploring
- solution_aware: know solutions exist, looking at options
- product_aware: tried or know specific tools
- most_aware: deep evaluation, comparing, switching

sentiment (how do they feel?):
- positive: clearly positive experience
- negative: clearly negative experience
- mixed: both positive and negative
- neutral: factual, no strong feeling`;

const USER_PROMPT_PREFIX = `Classify each item below. Return a JSON array with one object per item, in the same order.

Each object must have: {"id": "...", "evidence_state": "...", "intent": "...", "awareness_level": "...", "sentiment": "..."}

Items:
`;

/**
 * Classify a batch of evidence packets via LLM.
 * Each packet needs: { id, title, body }
 * Returns: Map<id, { evidence_state, intent, awareness_level, sentiment }>
 */
async function classifyBatch(packets) {
  if (!OPENROUTER_API_KEY || packets.length === 0) {
    return fallbackClassify(packets);
  }

  const itemsText = packets.map((p, i) => {
    const title = (p.title || "").slice(0, 150);
    const body = (p.body || "").slice(0, 300);
    return `[${p.id}]\nTitle: ${title}\n${body}`;
  }).join("\n---\n");

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://signals.local",
        "X-Title": "Signals Classifier",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: USER_PROMPT_PREFIX + itemsText },
        ],
      }),
    });

    if (!res.ok) {
      console.warn(`LLM classifier API error ${res.status}, falling back to regex`);
      return fallbackClassify(packets);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";

    // Parse JSON — handle both array and {items: [...]} formats
    let parsed;
    try {
      parsed = JSON.parse(text);
      if (parsed.items) parsed = parsed.items;
      if (parsed.classifications) parsed = parsed.classifications;
    } catch {
      console.warn("LLM classifier JSON parse failed, falling back to regex");
      return fallbackClassify(packets);
    }

    if (!Array.isArray(parsed)) {
      return fallbackClassify(packets);
    }

    // Build result map, validating each classification
    const results = new Map();
    for (let i = 0; i < packets.length; i++) {
      const p = packets[i];
      const c = parsed[i] || {};
      results.set(p.id, {
        evidence_state: validateState(c.evidence_state) || classifyEvidenceState(p.title, p.body),
        intent: validateIntent(c.intent) || classifyIntent(p.title, p.body),
        awareness_level: validateAwareness(c.awareness_level) || classifyAwareness(p.title, p.body),
        sentiment: validateSentiment(c.sentiment) || classifySentiment(p.title, p.body),
      });
    }

    return results;
  } catch (err) {
    console.warn("LLM classifier error:", err.message, "— falling back to regex");
    return fallbackClassify(packets);
  }
}

/** Fallback: use regex classifiers (free, instant, always works) */
function fallbackClassify(packets) {
  const results = new Map();
  for (const p of packets) {
    results.set(p.id, {
      evidence_state: classifyEvidenceState(p.title, p.body),
      intent: classifyIntent(p.title, p.body),
      awareness_level: classifyAwareness(p.title, p.body),
      sentiment: classifySentiment(p.title, p.body),
    });
  }
  return results;
}

const VALID_STATES = new Set(["promoting", "comparing", "tried_failed", "warning", "seeking", "found_what_works", "sharing_insight", "experiencing_pain"]);
const VALID_INTENTS = new Set(["pain", "promotion", "insight", "question", "comparison"]);
const VALID_AWARENESS = new Set(["unaware", "problem_aware", "solution_aware", "product_aware", "most_aware"]);
const VALID_SENTIMENTS = new Set(["positive", "negative", "mixed", "neutral"]);

function validateState(v) { return VALID_STATES.has(v) ? v : null; }
function validateIntent(v) { return VALID_INTENTS.has(v) ? v : null; }
function validateAwareness(v) { return VALID_AWARENESS.has(v) ? v : null; }
function validateSentiment(v) { return VALID_SENTIMENTS.has(v) ? v : null; }

/**
 * Classify packets in batches with concurrency control.
 * Returns: Map<id, { evidence_state, intent, awareness_level, sentiment }>
 */
export async function classifyPackets(packets, options = {}) {
  const batchSize = options.batchSize || BATCH_SIZE;
  const concurrency = options.concurrency || CONCURRENCY;
  const onProgress = options.onProgress || (() => {});

  const results = new Map();
  const batches = [];

  for (let i = 0; i < packets.length; i += batchSize) {
    batches.push(packets.slice(i, i + batchSize));
  }

  let completed = 0;

  // Process in concurrent chunks
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency);
    const batchResults = await Promise.all(chunk.map(batch => classifyBatch(batch)));

    for (const batchMap of batchResults) {
      for (const [id, classification] of batchMap) {
        results.set(id, classification);
      }
    }

    completed += chunk.length;
    onProgress({
      completed: Math.min(completed * batchSize, packets.length),
      total: packets.length,
      batches: completed,
      totalBatches: batches.length,
    });

    // Rate limiting
    if (i + concurrency < batches.length) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  return results;
}

/**
 * Reclassify all packets for a context using LLM.
 * Updates the database in place.
 */
export async function reclassifyContext(contextId, options = {}) {
  const { getDb } = await import("../db/connection.mjs");
  const db = getDb();

  const packets = db.prepare(
    `SELECT id, title, body FROM evidence_packets WHERE context_id = ?`
  ).all(contextId);

  if (packets.length === 0) return { updated: 0 };

  console.log(`Reclassifying ${packets.length} packets for ${contextId}...`);

  const classifications = await classifyPackets(packets, {
    onProgress: ({ completed, total }) => {
      if (completed % 100 === 0 || completed === total) {
        console.log(`  ${completed}/${total} classified`);
      }
    },
    ...options,
  });

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
  return { updated: classifications.size };
}
