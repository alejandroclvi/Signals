/**
 * Thread Intelligence Agent — analyzes individual Reddit threads via LLM.
 *
 * Sends the full thread (post + top comments sorted by upvotes) to Gemini Flash
 * via OpenRouter and gets structured intelligence back.
 *
 * Uses the 3-pass research methodology:
 *   Pass 1: Pain language (exact words, specific moments)
 *   Pass 2: Emotional depth (identity-level pain, "Not X, it's Y")
 *   Pass 3: Failed solutions (what they tried, upvote validation)
 */

import "../lib/env.mjs";
import { createHash } from "node:crypto";
import { getDb } from "../db/connection.mjs";
import { createUnits, getObservationIds } from "./intelligence-chain.mjs";
import crypto from "node:crypto";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  throw new Error("Missing OPENROUTER_API_KEY — set it in .env or environment");
}

const DEFAULT_MODEL = "google/gemini-2.0-flash-001";

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

const SYSTEM_PROMPT = `You are a behavioral research analyst. You analyze Reddit conversation threads to extract intelligence about what people ACTUALLY experience — not what they claim.

You analyze ONE thread at a time: the original post + all reply comments as a conversation unit.

Your job:
1. Identify PAIN LANGUAGE — exact quotes showing when/how the problem hits
2. Find EMOTIONAL DEPTH — where pain reaches identity level
3. Detect "NOT X, IT'S Y" — the surface problem vs. the deeper behavioral driver
4. Catalog FAILED SOLUTIONS — what was tried, community validation (upvotes = agreement)
5. Classify AWARENESS LEVEL — what have they already tried? How sophisticated is their understanding?
6. Extract AVATAR CLUES — who is this person? Role, experience level, context
7. Classify DESIRE TYPE — mass instinct (discovery demand, primal) vs mass technological (replacement demand, frustrated with existing)
8. Summarize CONVERSATION ARC — how did the thread evolve? Did consensus emerge?

Rules:
- Use EXACT quotes from the text. Never paraphrase or invent quotes.
- Upvote counts = community validation. A comment with 50 upvotes represents 50+ people agreeing.
- Look for DISAGREEMENTS in the thread — they reveal where the real complexity is.
- The most valuable insight is often in a reply, not the original post.
- If the thread is promotional, off-topic, or low-signal, set signal_quality to "noise" and keep other fields minimal.
- For awareness_level: unaware (don't know they have a problem), problem_aware (know the problem, exploring), solution_aware (know solutions exist, comparing), product_aware (tried specific tools), most_aware (deep evaluation, switching).

Respond with ONLY valid JSON matching the schema. No markdown, no explanation outside the JSON.`;

const USER_PROMPT_TEMPLATE = `Analyze this Reddit thread and extract behavioral intelligence.

THREAD from r/{{community}}:

POST ({{postScore}} upvotes, {{commentCount}} comments):
Title: {{title}}
{{postBody}}

COMMENTS (sorted by upvotes):
{{comments}}

---

Respond with JSON matching this exact schema:
{
  "pain_language": [{"quote": "exact text", "speaker": "u/name", "upvotes": 0, "moment": "when it happens"}],
  "emotional_depth": [{"quote": "exact text", "interpretation": "what this reveals", "upvotes": 0}],
  "not_x_its_y": [{"surface": "what they say", "deeper": "what it actually is", "confidence": 0.0}],
  "failed_solutions": [{"name": "Tool/approach", "reason": "why it failed/worked", "upvotes": 0, "verdict": "failed|mixed|worked"}],
  "awareness_level": "problem_aware",
  "avatar_clues": [{"clue": "description", "evidence": "what they said"}],
  "desire_type": "mass_instinct|mass_technological",
  "conversation_arc": "one sentence summary of how the thread evolved",
  "signal_quality": "high|medium|low|noise",
  "key_insight": "one sentence: the most actionable finding from this thread"
}`;

async function callOpenRouter(system, user, options = {}) {
  const model = options.model || DEFAULT_MODEL;
  const start = Date.now();

  const body = {
    model,
    max_tokens: options.max_tokens || 2048,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  // Gemini supports JSON mode
  if (model.includes("gemini")) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://signals.local",
      "X-Title": "Signals Thread Intelligence",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  const elapsed = Date.now() - start;

  return {
    text: data.choices[0].message.content,
    usage: data.usage || {},
    model: data.model,
    elapsed,
  };
}

function formatThreadForPrompt(thread) {
  const postMetrics = safeParseJson(thread.post.metrics, {});
  const postBody = (thread.post.body || "").slice(0, 1500);

  // Top 8 comments by upvotes, capped for budget
  const topComments = thread.comments.slice(0, 8);
  let commentsText = "";
  let charBudget = 2500;

  for (const c of topComments) {
    const m = safeParseJson(c.metrics, {});
    const body = (c.body || "").slice(0, 400);
    const line = `[${m.score || 0} upvotes] u/${(c.author_ref || "anon").replace("u/", "")}: ${body}\n\n`;
    if (commentsText.length + line.length > charBudget) break;
    commentsText += line;
  }

  const prompt = USER_PROMPT_TEMPLATE
    .replace("{{community}}", (thread.community || "unknown").replace("r/", ""))
    .replace("{{postScore}}", String(postMetrics.score || 0))
    .replace("{{commentCount}}", String(thread.commentCount))
    .replace("{{title}}", thread.title || "")
    .replace("{{postBody}}", postBody)
    .replace("{{comments}}", commentsText || "(no comments)");

  const contentHash = createHash("sha256").update(prompt).digest("hex").slice(0, 24);

  return { prompt, contentHash };
}

/**
 * Check if a thread has already been analyzed with the same content.
 * Returns true if analysis can be skipped.
 */
export function threadUnchanged(threadId) {
  const db = getDb();
  return db.prepare(
    `SELECT content_hash FROM thread_intelligence WHERE thread_id = ?`
  ).get(threadId)?.content_hash || null;
}

/**
 * Analyze a single thread via LLM.
 * Returns null if thread content is unchanged since last analysis.
 */
export async function analyzeThread(thread, options = {}) {
  const { prompt, contentHash } = formatThreadForPrompt(thread);

  // Skip if content unchanged (unless forcing reprocess)
  if (!options.forceReprocess) {
    const existingHash = threadUnchanged(thread.id);
    if (existingHash === contentHash) {
      return null; // unchanged, skip
    }
  }

  const response = await callOpenRouter(SYSTEM_PROMPT, prompt, {
    model: options.model || DEFAULT_MODEL,
    max_tokens: 2048,
  });

  // Parse JSON response
  let intelligence;
  try {
    intelligence = JSON.parse(response.text);
  } catch {
    // Retry once if JSON is malformed
    if (!options._retried) {
      return analyzeThread(thread, { ...options, _retried: true });
    }
    throw new Error(`Failed to parse LLM response as JSON for thread ${thread.id}`);
  }

  return {
    threadId: thread.id,
    intelligence,
    contentHash,
    model: response.model,
    tokensUsed: (response.usage.prompt_tokens || 0) + (response.usage.completion_tokens || 0),
    processingMs: response.elapsed,
  };
}

/**
 * Analyze a batch of threads with concurrency control.
 */
export async function analyzeThreadBatch(threads, options = {}) {
  const { maxConcurrency = 3, onProgress, model, forceReprocess } = options;
  const results = [];
  const skipped = [];
  const errors = [];

  // Process in chunks
  for (let i = 0; i < threads.length; i += maxConcurrency) {
    const chunk = threads.slice(i, i + maxConcurrency);
    const promises = chunk.map(async (thread) => {
      try {
        const result = await analyzeThread(thread, { model, forceReprocess });
        if (result === null) {
          skipped.push(thread.id);
        } else {
          results.push(result);
        }
        if (onProgress) onProgress({ done: results.length + skipped.length, total: threads.length, thread: thread.id, wasSkipped: result === null });
      } catch (err) {
        errors.push({ threadId: thread.id, error: err.message });
        if (onProgress) onProgress({ done: results.length + skipped.length, total: threads.length, error: err.message });
      }
    });
    await Promise.all(promises);

    // Rate limit between chunks
    if (i + maxConcurrency < threads.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return { results, skipped, errors };
}

/**
 * Store thread intelligence in the database.
 * Upserts by thread_id — one intelligence record per thread, overwritten on re-analysis.
 */
export function storeThreadIntelligence(result, contextId) {
  const db = getDb();
  const { threadId, intelligence, contentHash, model, tokensUsed, processingMs } = result;

  // Check if row exists for this thread
  const existing = db.prepare(`SELECT id FROM thread_intelligence WHERE thread_id = ?`).get(threadId);
  const id = existing?.id || crypto.randomUUID();

  db.prepare(`
    INSERT OR REPLACE INTO thread_intelligence
    (id, thread_id, context_id, pain_language, emotional_depth, not_x_its_y, failed_solutions,
     awareness_level, avatar_clues, desire_type, conversation_arc, signal_quality, key_insight,
     confidence_tier, model_used, tokens_used, processing_ms, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    threadId,
    contextId,
    JSON.stringify(intelligence.pain_language || []),
    JSON.stringify(intelligence.emotional_depth || []),
    JSON.stringify(intelligence.not_x_its_y || []),
    JSON.stringify(intelligence.failed_solutions || []),
    intelligence.awareness_level || null,
    JSON.stringify(intelligence.avatar_clues || []),
    intelligence.desire_type || null,
    intelligence.conversation_arc || null,
    intelligence.signal_quality || null,
    intelligence.key_insight || null,
    "llm_only",
    model || DEFAULT_MODEL,
    tokensUsed || 0,
    processingMs || 0,
    contentHash || null
  );

  // --- Intelligence chain: create L1 extraction units ---
  try {
    if (intelligence.signal_quality !== "noise") {
      // Get parent observation IDs from this thread's evidence packets
      const packetIds = db.prepare(
        "SELECT evidence_id FROM thread_packets WHERE thread_id = ?"
      ).all(threadId).map(r => r.evidence_id);
      const parentIds = getObservationIds(packetIds);

      const units = [];
      const community = db.prepare("SELECT community FROM threads WHERE id = ?").get(threadId)?.community;

      if (intelligence.key_insight) {
        units.push({
          unitType: "extraction",
          claim: intelligence.key_insight,
          sourceType: "thread_intelligence", sourceId: threadId, method: "llm",
          parentIds, contextId, threadId, community,
          confidence: { high: 0.8, medium: 0.6, low: 0.4 }[intelligence.signal_quality] || 0.5,
          confidenceBasis: "LLM thread analysis: " + (intelligence.signal_quality || "unknown") + " quality",
          createdBy: "thread-intelligence",
        });
      }

      for (const nxy of (intelligence.not_x_its_y || [])) {
        if (nxy.surface && nxy.deeper) {
          units.push({
            unitType: "extraction",
            claim: `"${nxy.surface}" \u2192 "${nxy.deeper}"`,
            detail: "Behavioral driver: surface problem vs deeper reality",
            sourceType: "thread_intelligence", sourceId: threadId, method: "llm",
            parentIds, contextId, threadId, community,
            confidence: nxy.confidence || 0.7,
            createdBy: "thread-intelligence",
          });
        }
      }

      for (const fs of (intelligence.failed_solutions || [])) {
        if (fs.name) {
          units.push({
            unitType: "extraction",
            claim: `${fs.name}: ${fs.verdict || "failed"} \u2014 "${(fs.reason || "").slice(0, 80)}"`,
            sourceType: "thread_intelligence", sourceId: threadId, method: "llm",
            parentIds, contextId, threadId, community,
            confidence: fs.upvotes ? 0.5 + Math.min(0.4, fs.upvotes / 50) : 0.5,
            confidenceBasis: fs.upvotes ? fs.upvotes + " upvotes" : null,
            createdBy: "thread-intelligence",
          });
        }
      }

      if (units.length > 0) createUnits(units);
    }
  } catch (e) { /* chain is non-blocking */ }

  return id;
}
