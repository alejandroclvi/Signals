/**
 * LLM-classify each hook title for LinkedIn-adaptation value.
 *
 * Per-title output:
 *   hook_score:        0-100 — does the title work as a standalone LinkedIn line?
 *   narrative_class:   contrarian-insider | geopolitical-bridge | dying-king |
 *                      underdog-winning | origin-story | meta-narrative |
 *                      specific-result | other
 *   audience_breadth:  tech-only | broad-interest
 *   quotable_line:     the exact phrase to steal/adapt
 *   linkedin_template: a one-sentence "your version" template, niche-agnostic
 *
 * Args: { hooks, minScore?=70, max?=12 }
 * Returns: { classified: [...], filtered: [...] }
 */

import "../../lib/env.mjs";

const MODEL = "google/gemini-2.0-flash-001";
const BATCH = 6;

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

const NARRATIVE_DEFINITIONS = `
- contrarian-insider: claims hidden truth about an industry actor ("X is secretly Y")
- geopolitical-bridge: bridges tech to geopolitics or national narratives
- dying-king: declares a popular thing is dying/dead/over
- underdog-winning: declares an underdog is winning/replacing the leader
- origin-story: explains a backstory or how something started
- meta-narrative: comments on the discourse itself (the story about the story)
- specific-result: a concrete numeric or named outcome ("X grew 10x", "I saved $20k")
- other: doesn't fit above`;

async function classifyBatch(batch, apiKey) {
  const block = batch.map((h, i) => `[${i + 1}] (${h.community}, ${h.upvotes} upvotes) "${h.title}"`).join("\n");
  const prompt = `You are scoring LinkedIn-hook potential for the following Reddit/HN post titles.

NARRATIVE CLASSES:
${NARRATIVE_DEFINITIONS}

For each title, return:
- hook_score (0-100): how well does the TITLE work as a standalone LinkedIn line? High score = title is quotable as-is, contrarian or specific, no body context required. Low score = generic, body-dependent, or pure information without narrative tension.
- narrative_class: one of the classes above
- audience_breadth: "tech-only" if only tech audience would care, "broad-interest" if broader (geopolitics, economics, business strategy, future-of-work)
- quotable_line: the exact phrase from the title to STEAL (often a substring)
- linkedin_template: a one-sentence "your version" template the user could adapt — keep the structural pattern but make the specific words placeholders ("[Industry] is quietly running on [unexpected_thing]")

Be strict. Score below 50 generously — most titles aren't good hooks.

TITLES:
${block}

Return ONLY JSON, no preamble:
{"verdicts":[{"id":1,"hook_score":N,"narrative_class":"...","audience_breadth":"...","quotable_line":"...","linkedin_template":"..."}]}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim() || "{}";
  try { return JSON.parse(text).verdicts || []; } catch { return []; }
}

export default async function classifyHookQuality({ hooks = [], minScore = 70, max = 12 } = {}) {
  if (!hooks.length) return { classified: [], filtered: [] };
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const classified = [];
  for (const batch of chunk(hooks.slice(0, 60), BATCH)) {
    const verdicts = await classifyBatch(batch, apiKey);
    for (const v of verdicts) {
      const idx = (v.id || 0) - 1;
      if (idx < 0 || idx >= batch.length) continue;
      classified.push({
        ...batch[idx],
        hook_score: v.hook_score ?? 0,
        narrative_class: v.narrative_class || "other",
        audience_breadth: v.audience_breadth || "tech-only",
        quotable_line: v.quotable_line || batch[idx].title,
        linkedin_template: v.linkedin_template || "",
      });
    }
  }
  const filtered = classified
    .filter(h => (h.hook_score || 0) >= minScore)
    .sort((a, b) => (b.hook_score || 0) - (a.hook_score || 0))
    .slice(0, max);
  return { classified, filtered };
}
