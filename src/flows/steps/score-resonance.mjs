/**
 * Score a LinkedIn article draft against codified resonance principles.
 *
 * Output is structured + traceable: each score has a reason tied to a
 * specific line/paragraph in the input. Suggested fixes quote the current
 * text and propose a rewrite.
 *
 * Args: { path, audience? }
 * Returns: { scores: {hook, specificity, narrative, contrarian, readability, cta, evidence_density, overall},
 *            archetype_predicted, archetype_clarity_score,
 *            suggested_fixes: [{component, current, suggestion, reason}],
 *            strengths, weaknesses }
 */

import "../../lib/env.mjs";
import { readFileSync } from "node:fs";
import { principlesAsPrompt } from "./linkedin-resonance-principles.mjs";

const MODEL = "google/gemini-2.0-flash-001";

export default async function scoreResonance({ path = "", audience = "" } = {}) {
  if (!path) throw new Error("path is required");
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  const text = readFileSync(path, "utf-8");

  const prompt = `You are a senior LinkedIn-content strategist evaluating a draft long-form article (700-1200 words).

The score is for ALGORITHMIC + AUDIENCE resonance — not literary quality. LinkedIn's algorithm rewards engagement (comments > likes), early dwell-time, and shares. The audience is professionals scrolling mobile-first.

${audience ? `INTENDED AUDIENCE: ${audience}\n` : ""}
## RESONANCE PRINCIPLES (use these as the scoring rubric)

${principlesAsPrompt()}

## ARTICLE TO EVALUATE

${text}

## SCORING TASK

Return ONLY valid JSON in this shape — no preamble, no explanation outside JSON:

{
  "scores": {
    "hook": <0-100>,
    "specificity": <0-100>,
    "narrative": <0-100>,
    "contrarian": <0-100>,
    "readability": <0-100>,
    "cta": <0-100>,
    "evidence_density": <0-100>,
    "archetype_clarity": <0-100>,
    "overall": <0-100>
  },
  "archetype_predicted": "contrarian-insider|specific-result-story|category-naming|post-mortem|field-report|comparison-deep|other",
  "archetype_reason": "one sentence explaining why this archetype fits or doesn't",
  "strengths": ["specific strength 1 (with quoted phrase from article)", "..."],
  "weaknesses": ["specific weakness 1 (with quoted phrase from article)", "..."],
  "suggested_fixes": [
    {
      "component": "hook|specificity|narrative|contrarian|readability|cta|evidence_density",
      "current": "exact quoted phrase from the article",
      "suggestion": "concrete rewrite proposal",
      "reason": "one-sentence explanation tied to a principle"
    }
  ]
}

SCORING RULES:
- BE STRICT. Default to 50-65 for typical drafts. Reserve 80+ for clearly engagement-optimized writing.
- Every "suggested_fix" MUST quote real text from the article in the "current" field. Do not paraphrase.
- The "overall" score is a weighted aggregate: hook 20%, specificity 15%, narrative 15%, cta 10%, contrarian 10%, readability 10%, evidence_density 10%, archetype_clarity 10%.
- Provide 3-6 suggested_fixes — concrete, actionable, traceable to specific lines.
- "strengths" and "weaknesses" must each cite a quoted phrase from the article.

Return ONLY the JSON object.`;

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
  const content = json.choices?.[0]?.message?.content?.trim() || "{}";
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw new Error("scorer returned invalid JSON"); }
  return parsed;
}
