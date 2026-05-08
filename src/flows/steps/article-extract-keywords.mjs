/**
 * Read an article markdown file, ask the LLM for the 4–6 most representative
 * audience-targeting keywords (the kind a LinkedIn search would actually use),
 * and a one-line audience descriptor for personalized DMs.
 *
 * Args: { path }
 * Returns: { keywords: string[], audience_descriptor: string, topic_summary: string }
 */

import "../../lib/env.mjs";
import { readFileSync } from "node:fs";

const MODEL = "google/gemini-2.0-flash-001";

export default async function extractKeywords({ path } = {}) {
  if (!path) throw new Error("path is required");
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  const text = readFileSync(path, "utf-8");

  const prompt = `You are extracting audience-targeting metadata from a LinkedIn article. The output drives a LinkedIn search.

ARTICLE:
${text.slice(0, 4500)}

Return ONLY valid JSON, no preamble:
{
  "keywords": [4-6 short keyword strings — what someone would type into LinkedIn's people-search box to find people who'd care about this article. Use job-title-like or specialty-like terms (e.g., "AI engineering", "developer tools", "indie founder"), NOT generic words. Avoid brand names unless central.],
  "audience_descriptor": "One sentence describing the ideal reader (used for DM personalization).",
  "topic_summary": "One sentence summarizing the article's central claim."
}`;

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
  try {
    const parsed = JSON.parse(content);
    return {
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 6) : [],
      audience_descriptor: parsed.audience_descriptor || "",
      topic_summary: parsed.topic_summary || "",
    };
  } catch {
    return { keywords: [], audience_descriptor: "", topic_summary: "" };
  }
}
