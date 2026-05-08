/**
 * Filter LinkedIn post candidates against the engagement criteria + suggest
 * the type of engagement (comment / repost / quote / skip).
 *
 * Args: { posts: [{ post_url, author_name, snippet, ... }], criteria, topic_summary, max?=10 }
 * Returns: { matches: [{ ...post, fit_score, engagement_type, angle }] }
 */

import "../../lib/env.mjs";

const MODEL = "google/gemini-2.0-flash-001";
const BATCH = 6;

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

async function scoreBatch(batch, criteria, topicSummary, apiKey) {
  const block = batch.map((p, i) => `[${i + 1}] ${p.author_name} — ${p.post_url}\n  "${(p.snippet || "").slice(0, 280)}"`).join("\n\n");
  const prompt = `You are evaluating LinkedIn post candidates as engagement opportunities.

CRITERIA: ${criteria}
TOPIC SUMMARY: ${topicSummary}

CANDIDATES:
${block}

For each candidate, decide:
- fit_score: 0..100 — how strongly the post matches the criteria
- engagement_type: one of "comment" (insightful reply that adds value), "quote" (worth quoting in your own post), "repost" (high-signal worth amplifying), "skip" (off-topic or low-value)
- angle: ONE specific sentence — what perspective YOU could add if you engaged. NOT generic. Reference the post's specific point.

Be conservative. Default to "skip" unless the post is clearly on-criteria and has an opening for a substantive contribution.

Return ONLY valid JSON, no preamble:
{"verdicts":[{"id":1,"fit_score":N,"engagement_type":"comment|quote|repost|skip","angle":"..."}]}`;
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
  try { return JSON.parse(json.choices?.[0]?.message?.content || "{}").verdicts || []; } catch { return []; }
}

export default async function scorePosts({ posts = [], criteria = "", topic_summary = "", max = 10, minFit = 60 } = {}) {
  if (!posts.length) return { matches: [] };
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const enriched = [];
  for (const batch of chunk(posts, BATCH)) {
    const verdicts = await scoreBatch(batch, criteria, topic_summary, apiKey);
    for (const v of verdicts) {
      const idx = (v.id || 0) - 1;
      if (idx < 0 || idx >= batch.length) continue;
      enriched.push({
        ...batch[idx],
        fit_score: v.fit_score ?? 0,
        engagement_type: v.engagement_type || "skip",
        angle: v.angle || "",
      });
    }
  }
  const matches = enriched
    .filter(p => p.engagement_type !== "skip" && (p.fit_score || 0) >= minFit)
    .sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0))
    .slice(0, max);
  return { matches, considered: enriched.length };
}
