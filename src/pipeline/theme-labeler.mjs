/**
 * Theme Labeler — generates readable theme labels from search queries via LLM.
 *
 * Replaces the hardcoded THEME_LABELS map in signal-extractor.mjs.
 * Sends all queries for a context in a single LLM call, gets back
 * a map of query → human-readable theme label.
 *
 * Results are cached on the context (theme_labels column).
 * Falls back to keyword extraction if LLM is unavailable.
 */

import "../lib/env.mjs";
import { getDb } from "../db/connection.mjs";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "google/gemini-2.0-flash-001";

/**
 * Generate theme labels for all queries in a context's research passes.
 * Stores result in context.theme_labels (JSON).
 * Returns the label map: { "query string": "Readable Label" }
 */
export async function generateThemeLabels(contextId) {
  const db = getDb();
  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(contextId);
  if (!context) return {};

  const passes = safeParseJson(context.research_passes, null);
  if (!passes) return {};

  // Collect all unique queries
  const queries = [];
  for (const pass of Object.values(passes)) {
    for (const q of (pass.queries || [])) {
      if (!queries.includes(q)) queries.push(q);
    }
  }

  if (queries.length === 0) return {};

  // Check cache
  const cached = safeParseJson(context.theme_labels, null);
  if (cached && Object.keys(cached).length >= queries.length * 0.8) {
    return cached;
  }

  if (!OPENROUTER_API_KEY) {
    return fallbackLabels(queries);
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://signals.local",
        "X-Title": "Signals Theme Labeler",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You group search queries into readable research themes. Given a list of queries, return a JSON object mapping each query to a short theme label (2-4 words, title case). Group similar queries under the SAME label — the goal is to reduce dozens of queries to 5-15 meaningful themes.

Example:
Input queries: ["figma slow loading", "figma crash frequently", "figma auto layout broken", "figma autolayout pain"]
Output: {"figma slow loading": "Performance Issues", "figma crash frequently": "Performance Issues", "figma auto layout broken": "Auto Layout", "figma autolayout pain": "Auto Layout"}`,
          },
          {
            role: "user",
            content: `Topic: ${context.label}\n\nQueries:\n${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.warn(`Theme labeler API error ${res.status}, falling back`);
      return fallbackLabels(queries);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const labels = JSON.parse(text);

    // Validate: must be a flat object with string values
    if (typeof labels !== "object" || Array.isArray(labels)) {
      return fallbackLabels(queries);
    }

    // Ensure every query has a label
    for (const q of queries) {
      if (!labels[q]) {
        labels[q] = deriveThemeFallback(q);
      }
    }

    // Cache on context
    ensureThemeLabelsColumn(db);
    db.prepare("UPDATE contexts SET theme_labels = ? WHERE id = ?")
      .run(JSON.stringify(labels), contextId);

    return labels;
  } catch (err) {
    console.warn("Theme labeler error:", err.message);
    return fallbackLabels(queries);
  }
}

/**
 * Get cached theme labels for a context, or empty object.
 */
export function getCachedThemeLabels(contextId) {
  const db = getDb();
  ensureThemeLabelsColumn(db);
  const row = db.prepare("SELECT theme_labels FROM contexts WHERE id = ?").get(contextId);
  if (!row?.theme_labels) return {};
  const parsed = safeParseJson(row.theme_labels, {});
  return parsed || {};
}

function fallbackLabels(queries) {
  const labels = {};
  for (const q of queries) {
    labels[q] = deriveThemeFallback(q);
  }
  return labels;
}

function deriveThemeFallback(query) {
  const cleaned = query.toLowerCase()
    .replace(/\b(reddit|i'm|i've|i|the|a|an|is|are|was|it|to|on|in|of|for|and|but|so|my|our|we|every|always|completely|actually|just|really|too|very|still|time|been|site:reddit\.com)\b/g, "")
    .replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(w => w.length > 2).slice(0, 3);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || query.slice(0, 30);
}

let _columnChecked = false;
function ensureThemeLabelsColumn(db) {
  if (_columnChecked) return;
  try {
    db.prepare("SELECT theme_labels FROM contexts LIMIT 0").get();
  } catch {
    db.prepare("ALTER TABLE contexts ADD COLUMN theme_labels TEXT").run();
  }
  _columnChecked = true;
}

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
