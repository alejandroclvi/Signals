/**
 * Generate an Instagram caption (and image-text suggestion) from top signals.
 * Output is shorter, more visual than the LinkedIn draft.
 *
 * Args: { signals: [...] }
 * Returns: markdown with caption + image-text + hashtags
 */

import "../../lib/env.mjs";

const MODEL = "google/gemini-2.0-flash-001";

export default async function igCaption({ signals = [] } = {}) {
  if (!signals.length) return "_No signals to draft from._";

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const top = signals.slice(0, 3).map(s => `- ${s.title} (score ${s.total}, ${s.mentions} mentions)`).join("\n");

  const prompt = `You are writing an Instagram post for a creator who runs Signals — a system that detects internet momentum.

Top signals from this week's scan:
${top}

Output THREE parts in this exact format:

IMAGE TEXT:
A single big sentence (8–14 words) that would work as overlay text on a square IG image. Make it provocative, specific. No emojis.

CAPTION:
A 60–110 word caption that expands on the image text. Conversational. One concrete observation. Ends with: "What are you seeing in your feed?"

HASHTAGS:
6–8 niche hashtags (no #AI, #tech, #marketing — avoid generic 1M+ ones). Mix small (~10k posts) and medium (~100k) hashtags.

Return ONLY those three sections separated by blank lines. No preamble.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/local/signals",
      "X-Title": "Signals weekly IG caption",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned empty response");
  return text;
}
