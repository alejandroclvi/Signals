/**
 * For a list of LinkedIn profiles + an article topic + audience descriptor,
 * draft a 1-2 sentence personalized DM intro per profile.
 *
 * The output is intended for human review BEFORE any send_message call.
 * This step does NOT send anything.
 *
 * Args: { profiles, articlePath, audience_descriptor, topic_summary }
 * Returns: { drafts: [{ name, url, message }] }
 */

import "../../lib/env.mjs";
import { readFileSync } from "node:fs";

const MODEL = "google/gemini-2.0-flash-001";
const BATCH = 6;

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

async function draftBatch(batch, ctx, apiKey) {
  const profileBlock = batch.map((p, i) => `[${i + 1}] ${p.name} — ${p.url} (matched on: ${p.source_keyword || "—"})`).join("\n");
  const prompt = `You are drafting personalized LinkedIn DM intros for a solo founder reaching out about an article they published.

ARTICLE TOPIC: ${ctx.topic_summary}
INTENDED AUDIENCE: ${ctx.audience_descriptor}
ARTICLE URL or SHORT TITLE: ${ctx.article_short_ref}

For each profile below, write a 1-2 sentence intro DM. Rules:
- DO NOT pitch. Open with a specific reason this person would care about the article (their match keyword is the seed).
- DO NOT use "Hi <name>!" exclamation openings. Use plain "Hi <first name>" or skip the greeting.
- One specific observation about why the article is relevant to their work, then mention the article briefly.
- 35-55 words MAX. Conversational. Don't link the article (LinkedIn DMs auto-preview links).
- Never claim to know them personally.

PROFILES:
${profileBlock}

Return ONLY valid JSON, no preamble:
{"drafts":[{"id":1,"message":"..."}, ...]}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.55,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim() || "{}";
  try { return JSON.parse(text).drafts || []; } catch { return []; }
}

export default async function linkedinDmDrafts({
  profiles = [],
  articlePath = null,
  audience_descriptor = "",
  topic_summary = "",
} = {}) {
  const valid = profiles.filter(p => p.slug && p.url);
  if (!valid.length) return { drafts: [] };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const articleShortRef = articlePath
    ? readFileSync(articlePath, "utf-8").split("\n").find(l => l.startsWith("# "))?.slice(2)?.slice(0, 90) || articlePath
    : "(no article path supplied)";
  const ctx = { topic_summary, audience_descriptor, article_short_ref: articleShortRef };

  const drafts = [];
  for (const batch of chunk(valid, BATCH)) {
    const out = await draftBatch(batch, ctx, apiKey);
    for (const d of out) {
      const idx = (d.id || 0) - 1;
      if (idx < 0 || idx >= batch.length) continue;
      drafts.push({ name: batch[idx].name, url: batch[idx].url, source_keyword: batch[idx].source_keyword, message: d.message });
    }
  }
  return { drafts, considered: valid.length };
}
