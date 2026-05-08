/**
 * Generate a LinkedIn post draft from top signals via OpenRouter (Gemini Flash).
 *
 * Args: { signals: [{ title, total, components, dominantState, ... }], style?: "punchy"|"thoughtful" }
 * Returns: markdown string suitable for paste into LinkedIn
 */

import "../../lib/env.mjs";

const MODEL = "google/gemini-2.0-flash-001";

function summarizeSignal(s) {
  const topComp = s.components?.[0];
  const compStr = topComp ? ` [strongest: ${topComp.name} ${topComp.weighted}]` : "";
  return `- ${s.title} (rank #${s.rank}, score ${s.total}, ${s.mentions} mentions, state: ${s.dominantState || "unclassified"})${compStr}`;
}

export default async function linkedinDraft({ signals = [], style = "punchy" } = {}) {
  if (!signals.length) return "_No signals to draft from._";

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const signalBlock = signals.map(summarizeSignal).join("\n");
  const styleHint = style === "thoughtful"
    ? "Reflective, curious, exploratory — frame the finding as a thinking-out-loud observation."
    : "Direct, specific, contrarian — lead with the most surprising number or pattern.";

  const prompt = `You are writing a LinkedIn post for Manuel, a solo founder building Signals — a system that detects internet momentum (behavior changes online before they're obvious).

He just ran his weekly signal scan. Here are the top signals from the most recent run:

${signalBlock}

Pick ONE signal as the post's anchor (the most counterintuitive, the most specific, or the most under-discussed) and write a 180–230 word LinkedIn post about it.

Style: ${styleHint}

Constraints:
- One concrete observation, not a list of three
- Lead with the surprising finding, not "I built a system"
- Include 1–2 specific numbers from the data (signal title, score, mentions)
- End with a question that invites a peer to share their experience
- No "🚀" or "💡" emoji clichés
- Max 3 hashtags at the end (relevant, not generic like #AI)
- Tone: smart, calm, direct — not breathless

Return ONLY the post text. No preamble, no markdown headers, no quoting.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/local/signals",
      "X-Title": "Signals weekly LinkedIn draft",
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
