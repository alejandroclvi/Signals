#!/usr/bin/env node
/**
 * One-off article composer for an EARLY-EMERGING (forming-state) signal.
 *
 * Different shape from compose-news-article.mjs:
 *   - News article = "today's event materializes weeks of signal"
 *   - Emerging article = "I'm naming this category before others do"
 *
 * Anchored on a single forming signal. Uses 4-5 hand-picked dated quotes that
 * triangulate the same gap from different angles. The article's job is to
 * NAME the category and stake a claim 2-4 weeks before the broader wave.
 *
 * Inputs are inline (this run is for the Differentiation Gap signal).
 * Output: output/articles/<date>-<slug>-emerging.md
 */

import "../src/lib/env.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

const MODEL = "google/gemini-2.0-flash-001";
const today = new Date().toISOString().slice(0, 10);

// ─── Signal under analysis ───────────────────────────────────────────────────
const SIGNAL = {
  id: "live:differentiation-gap",
  title: "Differentiation Gap: claude doesnt",
  niche: "AI coding tools / Claude Code competitive landscape",
  lifecycle: "forming",
  evidence_total: 33,
  evidence_30d: 3,
  evidence_7d: 1,
  context: "claude-code-knowledge-gap",
};

// ─── Triangulating evidence (real Reddit/HN posts, dated, with quotes) ──────
const TRIANGULATION = [
  {
    date: "2026-04-15",
    source: "Show HN (Markplane)",
    url: "https://news.ycombinator.com/item?id=47777143",
    role: "primary hook — names the specific limitation",
    quote: "I built Markplane because my AI coding assistant had no idea what I was working on. I use Claude Code daily. It's good at writing code, but it has zero awareness of project state — what's in progress, what's blocked, what was finished yesterday.",
  },
  {
    date: "2026-04-24",
    source: "HN Ask (DeepSeek V4)",
    url: "https://news.ycombinator.com/item?id=47885230",
    role: "competitive pressure — agent coordination is the new battleground",
    quote: "DeepSeek V4 is out. V4-Pro is their flagship. Beats Claude Opus 4.6 Max on Agent coding tasks (their words). Two models: Flash (284B total, 13B active) and Pro (1.6T total, 49B active). Both hit 1M token context.",
  },
  {
    date: "2026-04-28",
    source: "Show HN (ToolMesh)",
    url: "https://news.ycombinator.com/item?id=47933950",
    role: "solution surfacing — wiring agents to real-time state",
    quote: "When at night the pager goes off, I ask Claude: 'what is alerting, what changed in the last hour?'. Claude answers by chaining calls across Graylog, Prometheus, Alertmanager, Linode, GitLab.",
  },
  {
    date: "2026-05-07",
    source: "HN comment thread (Vibe coding + agentic engineering)",
    url: "https://news.ycombinator.com/item?id=48043782",
    role: "the gap surfacing again, in the vibe-coding community",
    quote: "Vibe coding and agentic engineering are getting closer than I'd like. The cracks show when you ask the model to coordinate across long workflows — not when it's writing a function.",
  },
];

// ─── Cross-corpus context ────────────────────────────────────────────────────
const CORPUS_CONTEXT = {
  mature_neighbor: {
    title: "Cost Management: claude code",
    state: "mature",
    last_30d: 107,
    role: "everyone's already arguing about cost; this article is about the next axis",
  },
  polymarket: {
    market: "Will Anthropic have the best AI model at the end of June 2026?",
    url: "https://polymarket.com/market/will-anthropic-have-the-best-ai-model-at-the-end-of-june-2026",
    yes_probability: 0.645,
    read: "Market still favors Anthropic on absolute model quality. Hasn't priced in the agent-coordination axis where DeepSeek V4 is reportedly ahead.",
  },
};

const AUDIENCE = "solo founders, devtools builders, and engineers shipping AI-augmented products";

const prompt = `You are writing a long-form LinkedIn article (700–900 words) for Manuel — a solo founder running Signals, an early-warning system that detects internet momentum from multi-source evidence.

The frame is different from a typical "what's hot" article. This is a NAMING article: a small, forming signal in the corpus is starting to surface, no one has named the category yet, and Manuel is staking a claim 2-4 weeks before the broader wave. Be specific and confident — but don't oversell. The strength of the piece is precision, not volume.

## SIGNAL UNDER ANALYSIS
Title: ${SIGNAL.title}
Niche: ${SIGNAL.niche}
Lifecycle: **${SIGNAL.lifecycle}** (${SIGNAL.evidence_total} packets total, ${SIGNAL.evidence_30d} in last 30d, ${SIGNAL.evidence_7d} in last 7d)
Read: this is small. That's the point — by the time it's "fresh" everyone will already be writing about it.

## TRIANGULATING EVIDENCE (dated, real URLs — cite at least 4 inline)

${TRIANGULATION.map((t, i) => `[${i + 1}] **${t.date}** — ${t.source}\n  Role: ${t.role}\n  URL: ${t.url}\n  Quote: "${t.quote}"`).join("\n\n")}

## CROSS-CORPUS CONTEXT

- **Mature neighbor**: "${CORPUS_CONTEXT.mature_neighbor.title}" (${CORPUS_CONTEXT.mature_neighbor.state}, ${CORPUS_CONTEXT.mature_neighbor.last_30d} packets in last 30d). ${CORPUS_CONTEXT.mature_neighbor.role}.
- **Polymarket reference**: "${CORPUS_CONTEXT.polymarket.market}" — currently ${(CORPUS_CONTEXT.polymarket.yes_probability * 100).toFixed(1)}% YES (${CORPUS_CONTEXT.polymarket.url}). ${CORPUS_CONTEXT.polymarket.read}

## REQUIRED ARTICLE STRUCTURE

1. **# Title** (50–90 chars). Does ONE of these:
   - Names the gap directly ("The Bug Nobody Benchmarks", "AI Coding's Next Axis")
   - Uses a contrarian assertion that points at the gap
   Don't be cute. Don't say "the future of X". Be specific.

2. **Lede** (3–4 sentences). Open with a personal observation framed as the Markplane-style narrative ("you ship a feature, then ask the AI to add the next, and it has no idea you finished the first yesterday"). Cite ONE specific number from the triangulation set.

3. **## The pattern forming on the edges** (2 paragraphs). Walk through 3 of the 4 triangulating posts in date order. Quote a specific line from each, inline-linked. Show the pattern: same gap, three different communities, three different angles.

4. **## A name for the next axis** (1–2 paragraphs). THIS IS THE KEY MOVE. Propose a category name for what's missing — something like "Project-state awareness" or "Agent coordination" or "Codebase context". Pick ONE name, define it clearly in one sentence, and stake the claim. The companies that win the next round are competing on THIS axis, not on syntax fluency.

5. **## What's actually missing** (1 paragraph + 3-bullet list). Be specific. Examples:
   - Awareness of what's actually changed since the last session
   - A real model of project state (in-progress / blocked / finished)
   - Memory of architectural decisions across days, not turns
   But sharpen these to the niche — don't generic-bullet.

6. **## What's already trying to solve it** (1 paragraph). Cite Markplane, ToolMesh, the broader MCP-wiring trend. Inline-link one of them. Don't oversell — note that none of these are "winning" yet.

7. **## The strategic read** (2 paragraphs). Forward-looking. Reference the cross-corpus context: while everyone's debating Cost Management (mature, ${CORPUS_CONTEXT.mature_neighbor.last_30d} packets/30d), the next axis is already forming. Mention the Polymarket probability — "the market still favors Anthropic on raw model quality, but it hasn't priced in the agent-coordination axis." Don't be triumphant; be observational.

8. **## What to watch** (1 paragraph). End with a precise builder question. NOT "what do you think?". Something like: "What's the cheapest way you've given your AI tools real project state — manifests, Linear sync, in-repo markdown?"

9. **Sources line** — USE THIS EXACT LINE VERBATIM:

*Drawn from a forming signal in the Signals corpus: ${SIGNAL.evidence_total} packets total, ${SIGNAL.evidence_30d} in the last 30 days, sourced from r/ClaudeCode, r/ClaudeAI, r/LocalLLaMA, and Hacker News between ${TRIANGULATION[0].date} and ${TRIANGULATION[TRIANGULATION.length - 1].date}. Cross-corpus reference: 1 mature neighbor signal (Cost Management, 107 packets/30d) and 1 Polymarket market on the Anthropic best-model probability. Run date: ${today}.*

## CONSTRAINTS

- **Inline citations are mandatory** — at least 4 markdown links \`[exact phrase from quote](url)\`. Quote real text from the triangulation set; do not paraphrase.
- Use real numbers from the inputs above. Do NOT invent dates, percentages, or counts.
- No clichés: avoid "game-changer", "revolutionary", "paradigm shift", "the future of X", "we live in a world where", "unlock the true potential", "in the age of AI-assisted development", "10x your productivity".
- Tone: observational, slightly contrarian, calm. Manuel runs a system that surfaces this stuff — he doesn't pitch it.
- The reader should finish the article able to USE the category name you proposed. Make it sticky.
- Audience: ${AUDIENCE}.
- 700–900 words total. Cut filler.

Return ONLY the article in markdown. No preamble, no closing remarks beyond the methodology line.`;

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

const slug = SIGNAL.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
const outPath = `output/articles/${today}-${slug}-emerging.md`;
mkdirSync("output/articles", { recursive: true });
writeFileSync(outPath, text);
console.log(`Wrote ${outPath}  (${text.length} chars, ${text.split(/\s+/).length} words)`);
