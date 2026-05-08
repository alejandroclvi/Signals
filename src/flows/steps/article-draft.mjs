/**
 * Long-form LinkedIn article draft.
 *
 * Freshness-aware (tiers, in-window quote tagging), valence-aware (positive vs
 * negative momentum signals are NOT collapsed into one narrative), audience-
 * aware ("what this means for X" gets specific advice), multi-source-aware
 * (HN posts and Polymarket markets supplement Reddit signal quotes).
 *
 * Args:
 *   signals          [{ title, total, rank, mentions, components, tier, tier_label,
 *                       last_7d, last_30d, share_30d, latest_at, valence, valence_basis }]
 *   quotes           [{ signal_id, signal_title, quotes: [...], window_start, window_end }]
 *   hooks            { topHooks, patterns }
 *   contextEvidence  { hn: [...], polymarket: [...], window_start, window_end }
 *   context          string
 *   audience         string ("for whom is this article useful?")
 *   asOf             YYYY-MM-DD
 *   windowDays       number
 *   targetWords?     number (default 750)
 */

import "../../lib/env.mjs";

const MODEL = "google/gemini-2.0-flash-001";

function block(label, content) { return `## ${label}\n${content}\n`; }

const LIFECYCLE_FRAMING = {
  fresh:    "fresh — strong recent emergence. You may write 'this week' if 7d count ≥ 10, otherwise 'this month'.",
  emerging: "emerging — growing but still proving out. Frame as 'forming' or 'gathering momentum'. Do not say 'this week'.",
  mature:   "mature — sustained over weeks. Frame as 'an established pattern' or 'still growing steadily'. Use it as background context.",
  fading:   "fading — evidence rate dropped sharply. Frame as 'the wave is breaking' or 'attention is shifting away'. Reference past peak.",
  forming:  "forming — sparse but recent. Frame as 'an early signal worth watching'. Do not anchor a thesis on it.",
  stalled:  "stalled — was forming, has not progressed. Frame as 'a question that hasn't materialized'. Use sparingly.",
  dormant:  "dormant — no recent evidence. Frame ONLY as historical context, never as 'happening now'.",
};

export default async function articleDraft({
  signals = [],
  quotes = [],
  hooks = { topHooks: [], patterns: [] },
  contextEvidence = { hn: [], polymarket: [] },
  context = "",
  audience = "solo founders and engineers shipping AI-augmented products",
  asOf = new Date().toISOString().slice(0, 10),
  windowDays = 30,
  targetWords = 750,
} = {}) {
  if (!signals.length) return "_No signals to write about._";

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  // ─── Compute methodology details from real data ───
  const allQuotes = quotes.flatMap(sq => sq.quotes);
  const inWindowQuotes = allQuotes.filter(q => q.in_window);
  const communities = [...new Set([
    ...allQuotes.map(q => q.community),
    ...(contextEvidence.hn || []).map(h => h.community),
  ])].filter(Boolean);
  const sources = [...new Set([
    ...allQuotes.map(q => q.source),
    ...((contextEvidence.hn || []).length ? ["hackernews"] : []),
    ...((contextEvidence.polymarket || []).length ? ["polymarket"] : []),
  ])].filter(Boolean);
  const quoteDates = allQuotes.map(q => q.date).filter(Boolean).sort();
  const earliestQuote = quoteDates[0];
  const latestQuote = quoteDates[quoteDates.length - 1];
  const window_start = quotes[0]?.window_start || contextEvidence.window_start || "(unknown)";

  // Lifecycle framing — derived from each signal's actual state
  const lifecycleStates = [...new Set(signals.map(s => s.lifecycle).filter(Boolean))];
  const lifecycleSummary = lifecycleStates.length
    ? lifecycleStates.map(s => `**${s}**: ${LIFECYCLE_FRAMING[s] || s}`).join("\n")
    : "(no lifecycle data — fall back to freshness inference from quote dates)";
  const hasFresh = signals.some(s => s.lifecycle === "fresh");
  const hasMaterializationEvent = signals.some(s => s.materialized_at);

  // ─── Valence summary ───
  const valenceCounts = signals.reduce((acc, s) => { acc[s.valence] = (acc[s.valence] || 0) + 1; return acc; }, {});
  const hasPositive = (valenceCounts.POSITIVE || 0) > 0;
  const hasNegative = (valenceCounts.NEGATIVE || 0) > 0;
  const isMixed = hasPositive && hasNegative;
  const allPositive = hasPositive && !hasNegative;
  const allNegative = hasNegative && !hasPositive;
  const dominantNarrative = isMixed
    ? "MIXED — both positive momentum AND negative friction signals are present. Find the TENSION between them and build the article around that tension."
    : allPositive
      ? "POSITIVE — all top signals reflect successful adoption / wins. Frame as 'what's working and why'."
      : allNegative
        ? "NEGATIVE — all top signals reflect friction / failure. Frame as 'what's breaking and why'."
        : "NEUTRAL — signals are not strongly valenced. Frame as observational analysis.";

  // ─── Build prompt blocks ───
  const signalBlock = signals.map(s => {
    const top = (s.components || []).slice(0, 3).map(c => `${c.name}=${c.weighted}`).join(", ");
    const lifecycle = s.lifecycle
      ? `lifecycle: **${s.lifecycle}** (${s.lifecycle_reason || "no reason recorded"})`
      : `lifecycle: unknown`;
    const trend = s.trend_ratio !== undefined && s.trend_ratio !== null
      ? `trend (30d/prev30d): ${typeof s.trend_ratio === "number" ? s.trend_ratio.toFixed(2) : s.trend_ratio}`
      : "";
    const evidence = `evidence — total ${s.evidence_total ?? s.mentions ?? 0}; last 7d: ${s.evidence_7d ?? s.last_7d ?? 0}; last 30d: ${s.evidence_30d ?? s.last_30d ?? 0}`;
    const materialized = s.materialized_at ? `\n  ⚡ MATERIALIZED — transitioned from ${s.prev_state || "earlier state"} to fresh on ${s.materialized_at.slice(0, 10)}` : "";
    return `- **${s.title}** (#${s.rank}, score ${s.total})\n  ${lifecycle}\n  ${evidence}${trend ? "; " + trend : ""}; latest: ${s.latest_at || "n/a"}\n  valence: **${s.valence}** [heuristic: ${s.valence_basis}] — verify against quotes; override if quotes contradict\n  strongest components: ${top}${materialized}`;
  }).join("\n");

  const quoteBlock = quotes.flatMap(sq =>
    sq.quotes.map(q => {
      const tag = q.in_window ? `IN-WINDOW · ${q.date}` : `older · ${q.date}`;
      const ups = q.upvotes ? ` · ${q.upvotes} upvotes` : "";
      return `[signal: "${sq.signal_title}" · ${tag} · ${q.community}${ups}] "${q.body}" — ${q.url}`;
    })
  ).join("\n\n");

  const hnBlock = (contextEvidence.hn || []).length
    ? contextEvidence.hn.map(h => `[HN · ${h.date}${h.upvotes ? ` · ${h.upvotes} upvotes` : ""}] "${h.title}" — ${h.url}\n  excerpt: ${h.body_excerpt || "(no body)"}`).join("\n\n")
    : "(no HN evidence in this context+window)";

  const pmBlock = (contextEvidence.polymarket || []).length
    ? contextEvidence.polymarket.map(p =>
        `[Polymarket · ${p.date}${p.volume24h ? ` · $${Math.round(p.volume24h).toLocaleString()} 24h` : ""}] "${p.market}" — currently ${p.probability !== undefined ? (p.probability * 100).toFixed(1) + "%" : "?"} YES — ${p.url}`
      ).join("\n\n")
    : "(no Polymarket evidence in this context)";

  const patternBlock = hooks.patterns.slice(0, 5).map(p =>
    `- **${p.pattern}** (${p.count} of top hooks): e.g., "${p.examples[0]?.title}" → ${p.examples[0]?.url}`
  ).join("\n");

  const topHookBlock = hooks.topHooks.slice(0, 8).map(h =>
    `- "${h.title}" (${h.community}, ${h.upvotes || "?"} upvotes) → ${h.url}`
  ).join("\n");

  const methodologyLine = `*Drawn from ${allQuotes.length} cited posts and comments (${inWindowQuotes.length} from the last ${windowDays} days, ${earliestQuote || "?"} to ${latestQuote || "?"})${(contextEvidence.hn || []).length ? `, ${(contextEvidence.hn || []).length} Hacker News posts` : ""}${(contextEvidence.polymarket || []).length ? `, ${(contextEvidence.polymarket || []).length} Polymarket markets` : ""} across ${communities.length} communities (${communities.slice(0, 5).join(", ")}${communities.length > 5 ? "…" : ""}) and ${sources.length} producer${sources.length === 1 ? "" : "s"} (${sources.join(", ")}). Run date: ${asOf}.*`;

  // ─── Article structure depends on valence mix ───
  const structureBlockMixed = `
## REQUIRED STRUCTURE (mixed valence — find the tension)

1. **# Title** (50–80 chars). Capture the TENSION between positive and negative signals. Mirror a proven hook pattern.
2. **Lede** (3–4 sentences). Name both sides briefly. Cite a specific number from a fresh or mature signal.
3. **## What's working** (2 paragraphs). Quote 2 IN-WINDOW sources from the POSITIVE signal(s).
4. **## What's breaking** (2 paragraphs). Quote 2 IN-WINDOW sources from the NEGATIVE signal(s).
5. **## The tension** (2 paragraphs). Synthesis. Cite 1+ HN post or Polymarket market here if available — multi-source evidence is what makes this section different from "just Reddit."
6. **## What this means for ${audience}** (1–2 paragraphs). 2–3 SPECIFIC, named behavior changes. No "implement X", no "consider Y" — concrete actions a person could take this week. Reference real product/tool names from the quotes if relevant.
7. **## What to watch** (1 paragraph). Forward-looking. End with a precise question — name the variable to watch, not "what do you think?"
8. **Sources line** — USE THE EXACT METHODOLOGY LINE BELOW VERBATIM.`;

  const structureBlockSingle = `
## REQUIRED STRUCTURE (coherent valence)

1. **# Title** (50–80 chars). Mirror a proven hook pattern. Counterintuitive and specific.
2. **Lede** (3–4 sentences). Lead with the surprising finding, cite a specific number from a fresh or mature signal.
3. **## What's actually happening** (2 paragraphs). Quote 2 IN-WINDOW sources.
4. **## Why this is different from the obvious story** (2 paragraphs). Quote 1 more IN-WINDOW source.
5. **## The deeper pattern** (2 paragraphs). Bring in cross-source evidence — cite 1+ HN post or Polymarket market here if available.
6. **## What this means for ${audience}** (1–2 paragraphs). 2–3 SPECIFIC, named behavior changes. No "implement X", no "consider Y" — concrete actions a person could take this week.
7. **## What to watch** (1 paragraph). Forward-looking. End with a precise question — name the variable, not "what do you think?"
8. **Sources line** — USE THE EXACT METHODOLOGY LINE BELOW VERBATIM.`;

  const structureBlock = isMixed ? structureBlockMixed : structureBlockSingle;

  const prompt = `You are writing a LinkedIn long-form article (${targetWords - 100}–${targetWords + 100} words) for Manuel, a solo founder building Signals — a system that detects internet momentum from multi-source evidence.

The article must be specific, sourced, and analytical — NOT a thought-leadership cliché.

## CRITICAL RULES

### A. LIFECYCLE FRAMING
Each signal carries a lifecycle state. **You MUST frame each signal according to its state — do not call a "fading" signal "this week's hot story", do not call a "dormant" signal anything other than historical context.**

States present in this run:
${lifecycleSummary}

${hasMaterializationEvent ? "⚡ One or more signals just MATERIALIZED — transitioned from forming/emerging to fresh. This is a high-value observation: 'the moment X became real'. Lead the article with the materialization if appropriate.\n" : ""}
When citing, prefer IN-WINDOW quotes. If you must use an older quote, frame it as historical context ("an earlier comment captures this:").

### B. VALENCE — DO NOT INVERT
Selected signals' valence mix: ${dominantNarrative}

Each signal carries a valence label below. **You MUST honor them.** A POSITIVE signal means people are succeeding/adopting/winning — frame it that way. A NEGATIVE signal means friction/failure/churn. **Do not collapse positive momentum into a negative narrative.** Verify each label against the actual quote content; if quotes contradict the label, say so explicitly in the article (e.g., "The 'Aha Moments' signal looks like adoption on the surface, but the quotes reveal…").

### C. AUDIENCE
This article is written for: **${audience}**.
The "What this means" section must give 2–3 specific behavior changes for this audience. Use real product/tool names from the quotes when relevant. No generic advice ("implement granular tracking", "consider flexible pricing"). Be concrete enough that a reader could act on it Monday morning.

${block("CONTEXT", context)}
${block("RUN DATE", asOf)}
${block("FRESHNESS WINDOW", `${window_start} to ${asOf} (${windowDays} days)`)}

${block("SELECTED SIGNALS", signalBlock)}

${block("PROVEN HOOK PATTERNS FROM TOP REDDIT POSTS IN THIS NICHE", patternBlock || "(no patterns detected)")}
${block("TOP HOOK EXAMPLES", topHookBlock)}

${block("REDDIT SIGNAL QUOTES — cite at least 4 inline as markdown links: [phrase](url). Tagged IN-WINDOW are within freshness window; 'older' must be framed as historical.", quoteBlock || "(no quotes available)")}

${block("HACKER NEWS EVIDENCE IN THIS CONTEXT (use in 'tension' or 'deeper pattern' section to add cross-source weight)", hnBlock)}

${block("POLYMARKET MARKETS IN THIS CONTEXT (use to anchor expectation/probability claims; cite the market URL)", pmBlock)}

${structureBlock}

${block("METHODOLOGY LINE — copy verbatim at the end of the article", methodologyLine)}

## CONSTRAINTS

- Inline citations are mandatory — at least 4 markdown links \`[exact phrase from source](url)\`. Quote real text, do not paraphrase.
- Use the methodology line provided EXACTLY. Do not invent dates, source counts, or fake URLs.
- No clichés: avoid "game-changer", "revolutionary", "paradigm shift", "the future of X", "we live in a world where", "unlock the true potential", "in the age of AI-assisted development".
- No "I built a system" energy.
- Use the proven hook patterns; don't invent your own opener.
- ${targetWords - 100}–${targetWords + 100} words total. Cut filler.

Return ONLY the article in markdown. No preamble, no closing remarks.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/local/signals",
      "X-Title": "Signals weekly LinkedIn article (fresh+valence+multisource)",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned empty response");
  return text;
}
