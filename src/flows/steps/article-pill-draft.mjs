/**
 * Compose a professional, pill-structured LinkedIn article.
 *
 * Inputs (any combination — at minimum painPills must be non-empty):
 *   painPills      — array of {quote, url, date?, community?, source?, note?}
 *   solutionPills  — array of {name, url, description, addresses?, source?, date?}
 *   insightPills   — array of {note, url?, source?}
 *   knowledgePills — array of {note, url, source?}
 *
 * The article is structured rigidly so every claim is traceable to a pill.
 */

import "../../lib/env.mjs";

const MODEL = "google/gemini-2.0-flash-001";

function fmtPainPill(p, i) {
  const tag = [p.community, p.date].filter(Boolean).join(" · ");
  return `[${i + 1}] ${tag ? `(${tag}) ` : ""}"${(p.quote || "").replace(/"/g, '\\"')}" — ${p.url}`;
}
function fmtSolutionPill(p, i) {
  const addr = p.addresses?.length ? ` (addresses Pain #${p.addresses.join(", #")})` : "";
  return `[${i + 1}] ${p.name}${addr} — ${p.url}\n  description: ${(p.description || "").slice(0, 240)}`;
}
function fmtInsight(p, i) {
  return `[I${i + 1}] ${p.note}${p.url ? ` (ref: ${p.url})` : ""}`;
}
function fmtKnowledge(p, i) {
  return `[K${i + 1}] ${p.note} — ${p.url}`;
}

const ARCHETYPE_GUIDE = {
  "specific-result": "Lead with a specific number/metric/outcome. Frame as 'I tracked/tested/measured X. Here's what happened.' Title should contain a concrete metric.",
  "contrarian-insider": "Lead with a claim that challenges received wisdom. Frame as 'X is doing Y; here's the real story.' Take a position the reader's circle assumes is true and refute it with evidence.",
  "geopolitical-bridge": "Bridge tech to broader strategic narratives (national/cultural/economic). Frame as 'X tech is reshaping Y narrative.'",
  "dying-king": "Declare a dominant thing is in decline. 'X's moat is not what it used to be' / 'X is dead.' Back with evidence.",
  "underdog-winning": "Frame an underdog (open source / region / smaller player) as winning against an incumbent.",
  "origin-story": "Tell the backstory. 'How X really started' / 'Why X became Y.'",
  "post-mortem": "'Here's why this approach failed.' Specific lessons from a specific failure.",
  "comparison-deep": "'X vs Y: I've used both. Here's the actual difference.' Multi-tool side-by-side.",
};

export default async function articlePillDraft({
  topic = "",
  audience = "solo founders, devtools builders, and engineers shipping AI-augmented products",
  painPills = [],
  solutionPills = [],
  insightPills = [],
  knowledgePills = [],
  asOf = new Date().toISOString().slice(0, 10),
  targetWords = 850,
  contextLabel = "",
  targetArchetype = "",
} = {}) {
  if (!Array.isArray(painPills) || painPills.length === 0) {
    throw new Error("at least one pain pill is required");
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const painBlock = painPills.map(fmtPainPill).join("\n\n");
  const solBlock = solutionPills.length
    ? solutionPills.map(fmtSolutionPill).join("\n\n")
    : "(none provided — write the article without a Solutions Surfacing section, or note that solutions haven't materialized yet)";
  const insightBlock = insightPills.length ? insightPills.map(fmtInsight).join("\n") : "(none)";
  const knowledgeBlock = knowledgePills.length ? knowledgePills.map(fmtKnowledge).join("\n") : "(none)";

  // Methodology numbers (real, not invented)
  const dates = painPills.map(p => p.date).filter(Boolean).sort();
  const earliest = dates[0] || "?";
  const latest = dates[dates.length - 1] || "?";
  const sources = [...new Set(painPills.map(p => p.source).filter(Boolean))];
  const communities = [...new Set([...painPills, ...solutionPills].map(p => p.community).filter(Boolean))];

  const methodology = `*Drawn from ${painPills.length} pain pills (${earliest} to ${latest}) and ${solutionPills.length} solution pill${solutionPills.length === 1 ? "" : "s"}${insightPills.length ? `, with ${insightPills.length} field insight${insightPills.length === 1 ? "" : "s"}` : ""}${knowledgePills.length ? ` and ${knowledgePills.length} supporting reference${knowledgePills.length === 1 ? "" : "s"}` : ""}. Sources: ${sources.join(", ") || "mixed"}. Communities: ${communities.slice(0, 6).join(", ") || "various"}${communities.length > 6 ? "…" : ""}. Run date: ${asOf}.*`;

  const archetypeBlock = targetArchetype && ARCHETYPE_GUIDE[targetArchetype]
    ? `\n## TARGET ARCHETYPE — STRUCTURAL CONSTRAINT\n\nShape this article as a **${targetArchetype}** piece:\n${ARCHETYPE_GUIDE[targetArchetype]}\n\nThis archetype was selected because it's currently outperforming on LinkedIn for this niche (per archetype-distribution analysis of indexed LinkedIn Pulse articles in the corpus).\n\nThe pill structure (pain points + solutions) still applies — but the LEAD, TITLE, and CONCLUSION must follow the archetype's pattern. Don't fight it.\n`
    : "";

  const prompt = `You are writing a professional LinkedIn article for ${audience}.

The article follows a strict pill-structured format. Every pain claim must come from a Pain Pill. Every solution claim must come from a Solution Pill. The article maps solutions to pains by NUMBER.
${archetypeBlock}
## TOPIC
${topic || "(use the pain pills to infer the topic)"}
${contextLabel ? `Context: ${contextLabel}` : ""}

## PAIN PILLS (numbered — cite by [#N] in the article)

${painBlock}

## SOLUTION PILLS (numbered — cite by [S#N] in the article)

${solBlock}

## FIELD INSIGHTS (incorporate naturally where they support the pattern)

${insightBlock}

## SUPPORTING KNOWLEDGE (cite in the conclusion or analysis)

${knowledgeBlock}

## REQUIRED ARTICLE STRUCTURE

1. **# Title** (50–90 chars). Specific. No "future of X" framing.

2. **Lede** (3–4 sentences). Frame the pain pattern. Reference one specific pain by quoting a phrase from it.

3. **## Pain points we're hearing** — numbered list (#1, #2, …) matching the pain pill numbers. For each:
   - The exact quoted line from the pill (markdown-link the quote to the URL)
   - One short sentence of context (community + date if present)
   Format example:
   > **1.** ["exact phrase"](url)
   > _r/Foo · 2026-04-15_ — your one-sentence context.

4. **## What these pains tell us** (1–2 paragraphs). Pattern analysis. Cite at least 2 pain pills by number. Incorporate field insights here when they fit.

5. **## Solutions surfacing** — numbered list (#1, #2, …) matching the solution pill numbers. ${solutionPills.length === 0 ? "If no solution pills provided, replace this section with '## The solution gap' — explain that no clear solutions have yet materialized." : "For each:\n   - **Tool name** with markdown link\n   - 1-2 sentence description (use the pill's description, don't invent features)\n   - 'Addresses Pain #N' explicit mapping"}

6. **## The conclusion** (1–2 paragraphs). Connect pains to solutions. Identify the gap. Cite supporting knowledge if available. Be observational, not triumphant.

7. **## What to watch** (1 paragraph). Forward-looking. End with a precise builder-targeted question.

8. **Sources line at the bottom** — USE THIS EXACT METHODOLOGY LINE VERBATIM:

${methodology}

## CONSTRAINTS

- **EVERY claim must trace to a pill.** Do not invent features, dates, or quotes.
- **Inline markdown citations are mandatory** — at least 4. Quote real text from the pills as link text.
- ${targetWords - 100}–${targetWords + 100} words total.
- No clichés: "game-changer", "revolutionary", "paradigm shift", "the future of", "we live in a world where", "unlock the true potential", "in the age of AI-assisted development", "10x your productivity".
- Tone: observational, specific, slightly contrarian.
- DO NOT modify the methodology line.

Return ONLY the article in markdown. No preamble.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.55,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  let text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty article response");
  // Strip code fences if the LLM wrapped its markdown
  text = text.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return text;
}
