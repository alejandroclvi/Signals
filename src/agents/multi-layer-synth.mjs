/**
 * Multi-layer synthesis agent.
 *
 * Two modes:
 *
 *   discoverTopics(samples) — given a sample of recent evidence from each of
 *     the 7 layers, return 5–8 cross-cutting topics that the evidence reveals.
 *     This is the "what stories are being told" pass — we don't tell the LLM
 *     what to look for; we let it surface narratives.
 *
 *   synthesizeTopic(topic, evidenceByLayer) — given one topic + bucketed
 *     evidence from each layer, return a structured analysis with per-layer
 *     commentary, integrated thesis, temporal classification, corroboration
 *     score, missing-evidence callouts, and recommended actions.
 *
 * Both calls use OpenRouter (Gemini 2.0 Flash) and return strict JSON.
 */

import "../lib/env.mjs";

const MODEL = "google/gemini-2.0-flash-001";

function openrouterKey() {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error("OPENROUTER_API_KEY not set");
  return k;
}

function summarizeEvidenceLine(p) {
  const date = (p.published_at || "").slice(0, 10);
  const community = p.community || "";
  const title = (p.title || "").replace(/\s+/g, " ").slice(0, 160);
  const body = (p.body || "").replace(/\s+/g, " ").slice(0, 220);
  const w = (p.evidence_weight ?? 1).toFixed(1);
  return `  · [${date} · ${community} · w=${w}] ${title}${body ? " — " + body : ""}`;
}

function buildLayerBlock(label, packets, max = 8) {
  if (!packets?.length) return `${label.toUpperCase()}: (no evidence)\n`;
  const sample = [...packets]
    .sort((a, b) => (b.evidence_weight || 0) - (a.evidence_weight || 0))
    .slice(0, max);
  return `${label.toUpperCase()} (${packets.length} total, showing top ${sample.length}):\n${sample.map(summarizeEvidenceLine).join("\n")}\n`;
}

async function callLLM(prompt, { temperature = 0.4, maxTokens = 2048, title = "Signals multi-layer synth" } = {}) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openrouterKey()}`,
      "HTTP-Referer": "https://github.com/local/signals",
      "X-Title": title,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("OpenRouter returned empty response");
  return { text, modelUsed: json.model || MODEL };
}

function extractJson(text) {
  // LLMs sometimes wrap JSON in ```json fences; strip them.
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
  }
  // Find first { or [ and last } or ] to be resilient to leading prose.
  const firstObj = t.indexOf("{");
  const firstArr = t.indexOf("[");
  const start = (firstObj === -1 ? Infinity : firstObj) < (firstArr === -1 ? Infinity : firstArr) ? firstObj : firstArr;
  if (start > 0) t = t.slice(start);
  const lastObj = t.lastIndexOf("}");
  const lastArr = t.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (end > 0 && end < t.length - 1) t = t.slice(0, end + 1);
  return JSON.parse(t);
}

/**
 * Discovery mode: identify cross-cutting topics.
 *
 * @param {object} sampleByLayer { conversation: [packets], intent: [...], … }
 * @param {string} contextLabel  human-readable context name
 * @param {number} maxTopics     default 8
 * @returns {Promise<Array<{name, description, key_terms, temporal_hypothesis, layers_present}>>}
 */
export async function discoverTopics({ sampleByLayer, contextLabel, maxTopics = 8 }) {
  const layerOrder = ["truth", "conversation", "intent", "behavior", "expectation", "economic", "capital"];
  const blocks = layerOrder
    .filter(l => sampleByLayer[l]?.length)
    .map(l => buildLayerBlock(l, sampleByLayer[l], 8))
    .join("\n");

  const prompt = `You are an analyst surfacing cross-cutting narratives from a multi-layer market intelligence system. The system has 7 evidence layers and ingests from real, independent sources per layer:

  - truth: official source (Anthropic GitHub releases, blog posts)
  - conversation: Reddit + Hacker News reactions
  - intent: Google Search results
  - behavior: GitHub repos + issues (what people are building)
  - expectation: Polymarket prediction markets (capital-staked forecasts)
  - economic: HN Who-is-hiring posts (paying companies)
  - capital: Yahoo Finance prices + Stocktwits sentiment + finance subreddits

Context: ${contextLabel}

Here is a sample of the highest-weighted evidence from the last 30 days, grouped by layer:

${blocks}

Identify ${maxTopics} cross-cutting topics or narratives the evidence reveals. Pick the topics where MULTIPLE layers carry the same story — those are the strongest cross-validated signals.

For each topic, return:
  name                   short topic name (e.g., "Trust Crisis: Quota Change")
  description            one sentence describing the narrative
  key_terms              array of 4-8 distinctive terms/phrases for cross-layer evidence matching
                         (concrete: feature names, version numbers, company names, specific phrases)
  temporal_hypothesis    "early" (signal forming, thin coverage), "current" (peak velocity,
                         broad multi-layer coverage), or "late" (post-peak, materialization
                         or fade)
  layers_present         array of layer ids carrying this signal (subset of:
                         truth, conversation, intent, behavior, expectation, economic, capital)

Strict requirements:
- Topics must be SPECIFIC and named — not "AI adoption" but "Claude Code quota change controversy"
- Skip topics carried by only one layer (those aren't cross-cutting yet)
- Use the actual vocabulary from the evidence, not invented terminology

Return STRICT JSON: an array of topic objects. No prose, no markdown, no preamble.`;

  const { text, modelUsed } = await callLLM(prompt, { temperature: 0.3, maxTokens: 2048, title: "Signals topic discovery" });
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) throw new Error("Discovery: expected JSON array, got " + typeof parsed);
  return { topics: parsed, modelUsed };
}

/**
 * Synthesis mode: per-topic, integrate evidence across layers.
 *
 * @param {object} topic                  topic object from discoverTopics
 * @param {object} evidenceByLayer        { conversation: [packets], … }
 * @param {string} contextLabel
 * @returns {Promise<{
 *   topic, description, thesis,
 *   temporal_state, temporal_reasoning,
 *   layer_analysis, corroboration_score,
 *   missing_evidence, recommended_actions
 * }>}
 */
export async function synthesizeTopic({ topic, evidenceByLayer, contextLabel }) {
  const layerOrder = ["truth", "conversation", "intent", "behavior", "expectation", "economic", "capital"];
  const blocks = layerOrder
    .map(l => buildLayerBlock(l, evidenceByLayer[l] || [], 8))
    .join("\n");

  const layerCoverage = Object.fromEntries(
    layerOrder.map(l => [l, (evidenceByLayer[l] || []).length])
  );

  const prompt = `You are synthesizing a multi-layer intelligence brief on ONE topic. Each layer has independent data sources — when they agree, the signal is corroborated; when they disagree, that's a contradiction worth flagging.

Context: ${contextLabel}

TOPIC: ${topic.name}
Description: ${topic.description}
Key terms: ${(topic.key_terms || []).join(", ")}
Temporal hypothesis (rough): ${topic.temporal_hypothesis}

Evidence buckets (top-weighted shown per layer):

${blocks}

Produce STRICT JSON with these fields:

{
  "thesis": "<2-3 sentence integrated read across all layers. What is the story?>",
  "temporal_state": "early" | "current" | "late",
  "temporal_reasoning": "<one sentence justifying the temporal_state choice — point to specific evidence dates / velocity / cross-layer presence>",
  "layer_analysis": {
    "truth":        "<1-2 sentences: what is the official record saying about this topic? '' if no evidence>",
    "conversation": "<1-2 sentences: what is the community reaction? Cite engagement numbers if visible. '' if no evidence>",
    "intent":       "<1-2 sentences: what are people searching for? Which destinations appear? '' if no evidence>",
    "behavior":     "<1-2 sentences: what are people building? Repos / issues? '' if no evidence>",
    "expectation":  "<1-2 sentences: what does the prediction market price this at? '' if no evidence>",
    "economic":     "<1-2 sentences: who is hiring / paying for this? '' if no evidence>",
    "capital":      "<1-2 sentences: how did equity markets / traders react? Cite tickers + moves. '' if no evidence>"
  },
  "corroboration_score": <float 0..1: 1.0 = all layers tell a coherent story; 0.5 = half corroborate, half neutral; <0.3 = contradictions or sparse>,
  "missing_evidence": [
    "<specific data point that would strengthen or refute this thesis but is absent. Be concrete.>",
    ...
  ],
  "recommended_actions": [
    { "action": "<concrete, monitorable next step>", "why": "<one sentence reason>" },
    ...  (2-4 items)
  ]
}

Style requirements:
- NEVER invent specific numbers (dates, dollar amounts, version numbers, upvote counts) — only cite what's literally in the evidence above
- If a layer has no evidence for this topic, set its layer_analysis value to ""
- Be specific in layer_analysis — name the layer's sources by id (yfinance, polymarket, etc.) where useful
- recommended_actions must be CONCRETE monitoring or research moves, not generic advice
- Strict JSON only — no markdown, no commentary outside the JSON`;

  const { text, modelUsed } = await callLLM(prompt, { temperature: 0.3, maxTokens: 2048, title: "Signals topic synthesis" });
  const parsed = extractJson(text);
  return { synthesis: parsed, modelUsed, layerCoverage };
}
