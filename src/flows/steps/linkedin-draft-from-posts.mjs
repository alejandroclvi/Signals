/**
 * Generate a LinkedIn post draft from a curated set of high-weighted POSTS
 * (titles, bodies, urls, engagement). This step exists because the original
 * `linkedin-draft` reads signal aggregates — which are too coarse for
 * narrative-driven articles. With actual post text in hand the LLM can pull
 * direct quotes, dates, and dollar amounts instead of describing a signal score.
 *
 * Args:
 *   posts: required array from extract-top-posts (each has title, body, url,
 *          community, published_at, weight, score, comments)
 *   style: "sharp"|"thoughtful"|"humor" (default "sharp")
 *   angle: optional one-line narrative the LLM should anchor on
 *          (e.g. "trust betrayal + multi-direction defection from Claude Code")
 *   targetWords: default 280
 *
 * Returns: markdown string ready to paste into LinkedIn
 */

import "../../lib/env.mjs";

const MODEL = "google/gemini-2.0-flash-001";

function summarizePost(p, i) {
  const date = (p.published_at || "").slice(0, 10);
  const bodySnippet = (p.body || "").replace(/\s+/g, " ").slice(0, 400);
  return `[${i + 1}] ${date} · ${p.community} · ${p.score}↑ / ${p.comments} comments · w=${p.weight?.toFixed(1) || "1.0"}
TITLE: ${p.title}
URL:   ${p.url}
BODY:  ${bodySnippet}${(p.body || "").length > 400 ? "…" : ""}`;
}

const STYLES = {
  sharp: "Direct, specific, contrarian. Lead with the sharpest number or quote. Engineering-leader voice — confident, no hedging.",
  thoughtful: "Reflective, curious. Frame the finding as thinking out loud. Less assertive, more observational. Good for not-yet-decided readers.",
  humor: "Self-aware, dry. Open with an absurd or ironic observation pulled from the corpus. Keep the underlying point sharp; let the humor do the disarming.",
};

export default async function linkedinDraftFromPosts({
  posts = [],
  style = "sharp",
  angle,
  targetWords = 280,
} = {}) {
  if (!posts.length) return "_No posts to draft from._";

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const postBlock = posts.slice(0, 12).map(summarizePost).join("\n\n");
  const styleHint = STYLES[style] || STYLES.sharp;
  const angleHint = angle
    ? `\nAnchor angle (the editorial thesis): ${angle}\n`
    : "\nPick the single most resonant story across these posts and anchor the article on it.\n";

  const prompt = `You are writing a LinkedIn post for Manuel, a solo founder building Signals — a system that detects internet momentum.

He just ran a weekly scan and these are the highest-weighted POSTS (not aggregated signals — actual posts with title, body, and engagement) from the past 30 days:

${postBlock}
${angleHint}
Style: ${styleHint}

Constraints:
- Target ${targetWords} words (range ${Math.round(targetWords * 0.85)}–${Math.round(targetWords * 1.15)})
- Open with the SHARPEST line you can extract from the corpus — a one-sentence reframe of the central tension. NOT "I built a system that…"
- Embed at least TWO direct quotes from the posts above (use > blockquote markdown). Pick the most concrete language — specific dollar amounts, version numbers, comparative claims.
- Use specific engagement numbers when they sharpen the point (e.g. "1,761 upvotes on a single rant"). Round only if it helps clarity.
- Include the URLs as inline references when quoting (LinkedIn renders them as link previews — but only the first one). Otherwise skip URLs.
- End with a one-line CTA that invites a peer (engineer, founder, product person) to share their own experience or counter-take. NOT "what do you think?" — something specific to the story.
- Max 3 hashtags. No #AI / #ML — too generic. Use community-or-topic-specific tags (e.g. #DevTools, #ClaudeCode, #BuilderEconomy).
- Tone: smart, calm, direct. No "🚀", no "Game changer", no "this changes everything".
- DO NOT name signal scores, dominant states, or other pipeline-internal vocabulary. The reader has never heard of evidence packets.

Return ONLY the post text. No preamble, no markdown headers, no quoting yourself.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/local/signals",
      "X-Title": "Signals LinkedIn draft (post-based)",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned empty response");
  return text;
}
