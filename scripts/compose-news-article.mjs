#!/usr/bin/env node
/**
 * One-off article composer for an external news event + corpus signal synthesis.
 *
 * Use case: a news item arrives (today: the Ollama / Gemma 4 / MTP email).
 * The article frames the news as the materialization of patterns the corpus
 * has been tracking. Inputs are passed inline; output is a long-form markdown
 * article saved to output/articles/<date>-<slug>-news.md.
 */

import "../src/lib/env.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

const MODEL = "google/gemini-2.0-flash-001";

const NEWS_TITLE = "Ollama: Gemma 4 with native Multi-Token Prediction (2x faster)";
const NEWS_BODY = `Ollama announced today that Gemma 4 now runs 2x faster with native Multi-Token Prediction (MTP), available both via Ollama's cloud (\`ollama run gemma4:31b-cloud\`) and natively on macOS via MLX (\`ollama run gemma4:31b-coding-mtp-bf16\`). The release includes integrations with Claude (\`ollama launch claude --model gemma4:31b-cloud\`), OpenClaw, and Hermes Agent — meaning workflows previously locked to cloud-only Claude Code can now run with Gemma 4 as the backend.`;

// HN signal trail — dated, with real URLs
const HN_TRAIL = [
  {
    date: "2026-03-31",
    title: "Ollama is now powered by MLX on Apple Silicon in preview",
    url: "https://news.ycombinator.com/item?id=47584046",
    excerpt: "MLX-backed inference on Apple Silicon — the foundation today's Gemma 4 announcement builds on.",
  },
  {
    date: "2026-04-15",
    title: "Show HN: A book that builds GPT-2, Llama 3, DeepSeek from scratch in PyTorch",
    url: "https://news.ycombinator.com/item?id=47779084",
    excerpt: "Open-source LLM internals are increasingly approachable to solo developers.",
  },
  {
    date: "2026-04-17",
    title: "Qwen3.6-35B-A3B: Agentic coding power, now open to all (HN comment)",
    url: "https://news.ycombinator.com/item?id=47801047",
    excerpt: "3090 llama.cpp benchmarks: Qwen3.6-35B-A3B-GGUF:UD-Q4_K_XL 105 t/s; gemma-4-26B-A4B-it-GGUF:UD-Q4_K_XL 103 t/s.",
  },
  {
    date: "2026-04-23",
    title: "Ask HN: Open-Source Coding Model and Harness at Claude Sonnet / Opus Level Perf?",
    url: "https://news.ycombinator.com/item?id=47876210",
    excerpt: "I am tired of Anthropic's rate limits. Is there a coding model + coding harness combination that I can run 100% locally? I need a local AI model and coding harness that matches Claude Code in performance.",
  },
  {
    date: "2026-04-30",
    title: "Ask HN (recurring): Open-Source Coding Model and Harness at Claude Sonnet / Opus Level Perf?",
    url: "https://news.ycombinator.com/item?id=47959218",
    excerpt: "Same question, asked one week later — demand keeps growing.",
  },
  {
    date: "2026-05-05",
    title: "Accelerating Gemma 4: faster inference with multi-token prediction drafters (HN comment)",
    url: "https://news.ycombinator.com/item?id=48027832",
    excerpt: "Multi-token prediction is the same thing as speculative decoding. Google has now provided small models for each of the previous Gemma 4 models, e.g. \"gemma-4-26B-A4B-it-assistant\" for \"gemma-4-26B\".",
  },
];

// Corpus signals from claude-code-knowledge-gap (lifecycle, evidence counts as of 2026-05-08)
const CORPUS_SIGNALS = [
  { title: "Cost Management: claude code", state: "mature", last7d: 17, last30d: 107, total: 233,
    representative_quote: "Please someone mention what you are doing with all this cost? The fact nobody actually says that suggest most are losing money?",
    representative_url: "https://www.reddit.com/r/ClaudeCode/comments/1sqo251/heavy_api_users_how_much_money_are_you_burning/oh99goo/" },
  { title: "Churn Reasons: claude code", state: "mature", last7d: 25, last30d: 50, total: 131,
    representative_quote: "I Bought Claude Code And Refunded Claude Code Today. Due to the changes to copilot, I bought claude code today since opus was my main model and I was on the copilot pro plan. At the end of my work day I made one request through the cli tool and went to dinner (was at 3% of my weekly limit).",
    representative_url: "https://www.reddit.com/r/GithubCopilot/comments/1srryiy/i_bought_claude_code_and_refunded_claude_code/" },
  { title: "Token Waste: claude code", state: "mature", last7d: 5, last30d: 42, total: 171,
    representative_quote: "I have been on vacation. Opened Claude to ask how can save usage when I get back after reports of burn rates being high. It told me it wasn't an issue because I'm not using agents. That used 27% of my 5 hour session.",
    representative_url: "https://www.reddit.com/r/ClaudeCode/comments/1sbggsf/users_hitting_usage_limits_way_faster_than/oe3auru/" },
];

const POLYMARKET_REFERENCE = {
  market: "Will Anthropic have the best AI model at the end of June 2026?",
  url: "https://polymarket.com/market/will-anthropic-have-the-best-ai-model-at-the-end-of-june-2026",
  yes_probability: 0.645,
  vol24h: 14759,
  read: "Anthropic still favored, but the market hasn't priced in a meaningful local-LLM displacement scenario.",
};

const AUDIENCE = "solo founders, indie hackers, and engineers running Claude Code as their primary AI coding stack";

const today = new Date().toISOString().slice(0, 10);

const prompt = `You are writing a LinkedIn long-form article (700–850 words) for Manuel — a solo founder who runs Signals, an early-warning system that detects internet momentum from multi-source evidence.

The trigger: a news email arrived today. The article's job is to frame the news as the materialization of patterns Signals has been tracking for weeks — not as standalone news.

## NEWS EVENT (the catalyst)
**${NEWS_TITLE}**

${NEWS_BODY}

## MULTI-WEEK SIGNAL TRAIL FROM HACKER NEWS (in date order, oldest first)

${HN_TRAIL.map(h => `- **${h.date}** — "${h.title}"\n  ${h.excerpt}\n  ${h.url}`).join("\n\n")}

## CORPUS SIGNALS (from Signals' claude-code-knowledge-gap context)

These are the demand-side patterns that today's news answers. Each is **mature** in lifecycle terms (sustained activity over weeks) with strong recent flow:

${CORPUS_SIGNALS.map(s => `- **${s.title}** (lifecycle: ${s.state}; last 7d: ${s.last7d}, last 30d: ${s.last30d}, total: ${s.total} packets)\n  representative quote: "${s.representative_quote}"\n  ${s.representative_url}`).join("\n\n")}

## POLYMARKET REFERENCE (expectation layer)

- "${POLYMARKET_REFERENCE.market}" — currently ${(POLYMARKET_REFERENCE.yes_probability * 100).toFixed(1)}% YES on $${POLYMARKET_REFERENCE.vol24h.toLocaleString()} 24h volume.
- ${POLYMARKET_REFERENCE.url}
- Market read: ${POLYMARKET_REFERENCE.read}

## REQUIRED ARTICLE STRUCTURE

1. **# Title** (50-90 chars). Hook the reader on the materialization framing — "this didn't come from nowhere." Counterintuitive and specific.

2. **Lede** (3–4 sentences). Open with today's news in one line. Pivot immediately to: "Signals has been tracking this for [N] weeks." Cite a specific number from the corpus (e.g., "107 packets about Cost Management in the last 30 days").

3. **## The signal trail** (2 paragraphs). Walk through the HN dates in order — March 31 (MLX preview) → April 17 (open-source benchmarks) → April 23/30 (the recurring "where is the open-source Claude alternative" Asks) → May 5 (MTP comment) → May 8 (today's announcement). Cite at least 3 of the dates inline as markdown links: \`[phrase](url)\`. The point: today's release is the predictable conclusion of a multi-week arc.

4. **## What the corpus said for months** (2 paragraphs). Quote 2 of the corpus signals inline. Show the demand-side: cost frustration, churn, token waste. Use real evidence counts ("17 packets in last 7 days") and the actual quoted text. Inline-link to the source URLs.

5. **## What changes today** (2 paragraphs). Specific, technical. Gemma 4 31b runs at ~103 t/s on a 3090 (cite the April 17 benchmark). MTP roughly doubles that. Hermes Agent / OpenClaw / direct Claude integration mean drop-in replacement is plausible for some workflows. Ground in the named tools and exact numbers from the news email.

6. **## What this means for ${AUDIENCE}** (1–2 paragraphs). 3 specific actions for THIS week:
   - Action 1: pick a low-stakes Claude Code workflow and benchmark Gemma 4 31b-coding-mtp-bf16 on it (specific commands)
   - Action 2: instrument cost — measure your Claude Code usage now so you know what local would save
   - Action 3: track the Polymarket Anthropic-best-model probability (linked) as a leading indicator
   No generic "consider this" advice — concrete things you can do Monday.

7. **## What to watch** (1 paragraph). Forward-looking. Name the variables: HN benchmark threads in the next 30 days; whether the recurring "where is the open-source Claude" Ask continues or stops; whether the Polymarket probability moves below 60%. End with a precise question.

8. **Sources line** — use this VERBATIM at the end:

*Drawn from a 6-week multi-source signal trail: ${HN_TRAIL.length} Hacker News posts/comments (${HN_TRAIL[0].date} to ${HN_TRAIL[HN_TRAIL.length - 1].date}), ${CORPUS_SIGNALS.reduce((s, x) => s + x.last30d, 0)} corpus packets across ${CORPUS_SIGNALS.length} mature signals from r/ClaudeCode, r/ClaudeAI, r/GithubCopilot, r/LocalLLaMA, plus 1 Polymarket market on the Anthropic best-model probability. Run date: ${today}.*

## CONSTRAINTS

- Mandatory inline citations: at least 5 markdown links \`[exact phrase](url)\` distributed through the body.
- Use real numbers from the inputs above. Do NOT invent dates, percentages, or tokens-per-second figures.
- No clichés: avoid "game-changer", "revolutionary", "paradigm shift", "the future of X", "we live in a world where", "unlock the true potential", "in the age of AI-assisted development".
- The tone is observational and slightly contrarian — Manuel runs a system that sees this stuff coming. Don't oversell. Don't pitch.
- Use the EXACT methodology line provided. Do not modify or invent your own.

Return ONLY the article in markdown. No preamble. No closing remarks beyond the methodology line.`;

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("OPENROUTER_API_KEY not set"); process.exit(1); }

const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.55,
  }),
});
if (!res.ok) { console.error(`OpenRouter ${res.status}: ${await res.text()}`); process.exit(1); }
const json = await res.json();
const text = json.choices?.[0]?.message?.content?.trim();
if (!text) { console.error("Empty response"); process.exit(1); }

const outPath = `output/articles/${today}-ollama-gemma4-mtp-news.md`;
mkdirSync("output/articles", { recursive: true });
writeFileSync(outPath, text);
console.log(`Wrote ${outPath}  (${text.length} chars, ${text.split(/\s+/).length} words)`);
