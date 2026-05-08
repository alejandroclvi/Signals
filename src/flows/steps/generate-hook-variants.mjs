/**
 * Generate 5 distinct opening hooks for a LinkedIn long-form article — each
 * built around a different archetype. Reads the article's topic from either
 * an explicit param or from the article file's first paragraph.
 *
 * Args: { path?, topic?, audience? }
 * Returns: { variants: [{ archetype, hook_text, first_14_words, why_this_works, risk }] }
 *
 * Each variant has its first 14 words isolated — that's what shows on
 * LinkedIn mobile before the "see more" cut.
 */

import "../../lib/env.mjs";
import { readFileSync } from "node:fs";

const MODEL = "google/gemini-2.0-flash-001";

const ARCHETYPES = [
  { id: "specific-numbers", description: "Open with a concrete number or dollar amount that's slightly surprising." },
  { id: "contrarian-insider", description: "Open with a claim that challenges received wisdom in the niche." },
  { id: "personal-stakes", description: "Open with a first-person moment of failure, decision, or surprise — high stakes in 10-15 words." },
  { id: "specific-question", description: "Open with a question whose answer isn't obvious — must NOT be 'what do you think?'." },
  { id: "insider-observation", description: "Open with 'I've been tracking X across N sources' — implies authority + specificity." },
];

function first14Words(text) {
  const words = text.trim().split(/\s+/);
  return words.slice(0, 14).join(" ") + (words.length > 14 ? "…" : "");
}

export default async function generateHookVariants({ path = "", topic = "", audience = "" } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  let articleSnippet = "";
  if (path) {
    try {
      const text = readFileSync(path, "utf-8");
      articleSnippet = text.slice(0, 1800);
    } catch { /* path optional */ }
  }
  if (!topic && !articleSnippet) {
    throw new Error("either path or topic is required");
  }

  const archetypeBlock = ARCHETYPES.map((a, i) => `[${i + 1}] **${a.id}** — ${a.description}`).join("\n");

  const prompt = `You are generating 5 distinct opening hooks for a LinkedIn long-form article. Each must follow a DIFFERENT archetype — ALL 5 archetypes below.

${audience ? `AUDIENCE: ${audience}\n` : ""}${topic ? `TOPIC: ${topic}\n` : ""}${articleSnippet ? `ARTICLE (use to ground specifics):\n${articleSnippet}\n` : ""}
ARCHETYPES (you must produce one hook per archetype, in this order):

${archetypeBlock}

For each hook:
- Total length 18-35 words
- The FIRST 14 words must work as a complete teaser on mobile (LinkedIn truncates there)
- Cite a specific number, name, or claim from the article when possible — don't invent
- Avoid: "In today's...", "We live in a world...", "AI is changing everything...", "Here's the thing...", any cliché opener

Return ONLY JSON, no preamble:
{
  "variants": [
    {
      "archetype": "specific-numbers",
      "hook_text": "full 18-35 word hook",
      "why_this_works": "one sentence — what algorithmic / audience effect this triggers",
      "risk": "one sentence — when this archetype fails for THIS topic"
    },
    ...5 entries total, in archetype order
  ]
}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.65,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content?.trim() || "{}";
  let parsed;
  try { parsed = JSON.parse(content); } catch { return { variants: [] }; }
  const variants = (parsed.variants || []).map(v => ({
    ...v,
    first_14_words: first14Words(v.hook_text || ""),
  }));
  return { variants };
}
