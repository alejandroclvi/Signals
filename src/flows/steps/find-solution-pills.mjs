/**
 * Auto-mine solution pills from the corpus. A solution pill = a product/tool
 * launch or strong recommendation with a real URL.
 *
 * Selection sources:
 *   - Show HN posts (community='hn:show') — most reliable: people launching things
 *   - Reddit posts in {promoting, found_what_works} states
 *   - Optionally LLM-filter: "is this a real product/tool relevant to <topic>?"
 *
 * Args: { context, topic_summary?, windowDays?=120, max?=6, useLlmFilter?=false }
 * Returns: { pills: [{ name, url, description, source, date, community }], source: "corpus" }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";

const MODEL = "google/gemini-2.0-flash-001";

function clean(text) {
  if (!text) return "";
  return String(text).replace(/<[^>]+>/g, "").replace(/&#x[0-9A-F]+;/gi, "").replace(/\s+/g, " ").trim();
}

function deriveName(title, body) {
  if (!title) return null;
  // Show HN: NAME – description  →  pull NAME
  const showHn = title.match(/^Show HN:\s*([^–—\-:|]+?)(?:\s*[–—\-:|]\s*|\s*$)/i);
  if (showHn) return showHn[1].trim().slice(0, 60);
  return title.slice(0, 80);
}

async function llmFilter(candidates, topicSummary, apiKey) {
  if (!apiKey) return candidates;
  const block = candidates.map((c, i) => `[${i + 1}] ${c.name} — ${(c.description || "").slice(0, 200)}`).join("\n");
  const prompt = `For the topic: "${topicSummary}"

Which of the candidates below is a real product/tool/service that addresses the topic's pain? Be conservative — exclude personal projects with no description, joke posts, or off-topic items.

CANDIDATES:
${block}

Return ONLY JSON: {"keep":[1,3,5]}`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return candidates;
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}");
    if (!Array.isArray(parsed.keep)) return candidates;
    return parsed.keep.map(i => candidates[i - 1]).filter(Boolean);
  } catch {
    return candidates;
  }
}

export default async function findSolutionPills({
  context,
  topic_summary = "",
  windowDays = 120,
  max = 6,
  useLlmFilter = false,
} = {}) {
  if (!context) throw new Error("context is required");
  const db = getDb();
  const windowStart = new Date(Date.now() - windowDays * 86400_000).toISOString();

  const rows = db.prepare(`
    SELECT ep.id, ep.url, ep.title, ep.body, ep.community, ep.source_id,
           ep.source_kind, ep.evidence_weight, ep.evidence_state, ep.published_at
    FROM evidence_packets ep
    WHERE ep.context_id = ?
      AND ep.url IS NOT NULL
      AND ep.published_at >= ?
      AND (
        ep.community = 'hn:show'
        OR ep.evidence_state IN ('promoting', 'found_what_works')
        OR (ep.title IS NOT NULL AND ep.title LIKE 'Show HN:%')
      )
      AND length(COALESCE(ep.body, ep.title, '')) >= 60
    ORDER BY ep.evidence_weight DESC, ep.published_at DESC
    LIMIT 60
  `).all(context, windowStart);

  const seenUrls = new Set();
  const seenNames = new Set();
  const candidates = [];
  for (const r of rows) {
    if (seenUrls.has(r.url)) continue;
    const name = deriveName(r.title, r.body);
    if (!name) continue;
    const nameKey = name.toLowerCase().slice(0, 32);
    if (seenNames.has(nameKey)) continue;
    const description = clean(r.body || r.title).slice(0, 240);
    seenUrls.add(r.url);
    seenNames.add(nameKey);
    candidates.push({
      name,
      url: r.url,
      description,
      source: r.source_id,
      community: r.community,
      date: r.published_at?.slice(0, 10),
    });
    if (candidates.length >= max * 3) break;  // overshoot for LLM filter
  }

  let filtered = candidates;
  if (useLlmFilter && topic_summary) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) filtered = await llmFilter(candidates, topic_summary, apiKey);
  }
  filtered = filtered.slice(0, max);
  return { pills: filtered, source: "corpus", considered: candidates.length };
}
