/**
 * Narrative-format article generator.
 *
 * Companion to article-pill-draft.mjs. Same input shape (pain pills + solutions
 * + insights + knowledge), DIFFERENT output structure: flowing prose with
 * inline-cited quotes, NO numbered pill lists.
 *
 * Use for archetypes that need narrative arc: dying-king, geopolitical-bridge,
 * contrarian-insider, origin-story, underdog-winning.
 *
 * Why split this from the pill generator: empirical resonance data showed pill
 * structure imposes a 'field-report' archetype regardless of targeting. Non-
 * field-report archetypes need a different structural mold.
 */

import "../../lib/env.mjs";

const MODEL = "google/gemini-2.0-flash-001";

const NARRATIVE_ARCHETYPE_GUIDE = {
  "dying-king": {
    arc: "OLD-WORLD → CHALLENGER → INFLECTION. Establish the dominant paradigm. Show the cracks. Name the moment of inflection. Don't be triumphant — be observational.",
    title_hint: "Should declare decline of the dominant thing or name the inflection ('X's moat is not what it used to be', 'The end of X', 'Y is killing X').",
  },
  "geopolitical-bridge": {
    arc: "TECH MOMENT → BROADER STAKES → IMPLICATION. Open with a specific tech development. Pivot to its broader (national/cultural/strategic) significance. Close with what to watch.",
    title_hint: "Bridge tech to non-tech stakes ('X is reshaping Y', 'How tech development X became a Y issue').",
  },
  "contrarian-insider": {
    arc: "RECEIVED WISDOM → COUNTER-EVIDENCE → REFRAMING. State what 'everyone' thinks. Show what the data actually says. Reframe the question.",
    title_hint: "Implies hidden truth ('X is secretly Y', 'The real story behind X', 'Everyone says X. They're wrong.').",
  },
  "origin-story": {
    arc: "ASSUMED HISTORY → REAL HISTORY → IMPLICATION. People think X happened because Y. The actual story is Z. Here's why the difference matters now.",
    title_hint: "About backstory ('How X really started', 'Why Y became Z').",
  },
  "underdog-winning": {
    arc: "INCUMBENT POWER → UNDERDOG MOVE → MOMENT-OF-TURNING. Establish the incumbent. Show the underdog's specific moves. Identify the inflection.",
    title_hint: "Underdog ascendance ('In the X war, Y is winning', 'The unexpected rise of Z').",
  },
  "post-mortem": {
    arc: "PROMISE → REALITY → LESSONS. The promise was X. What actually happened was Y. Here's what specifically broke and why.",
    title_hint: "Post-mortem framing ('Why X failed', 'Lessons from Y collapse').",
  },
};

function fmtPainAsProseSource(p, i) {
  const tag = [p.community, p.date].filter(Boolean).join(" · ");
  return `(P${i + 1}) [${tag}] "${(p.quote || "").replace(/\s+/g, " ")}" → ${p.url}`;
}
function fmtSolutionAsProseSource(p, i) {
  return `(S${i + 1}) ${p.name} — ${p.url}\n  what it does: ${(p.description || "").slice(0, 200)}`;
}
function fmtInsight(p, i) { return `(I${i + 1}) ${p.note}${p.url ? ` (ref: ${p.url})` : ""}`; }
function fmtKnowledge(p, i) { return `(K${i + 1}) ${p.note} — ${p.url}`; }

export default async function articleNarrativeDraft({
  topic = "",
  audience = "solo founders, devtools builders, and engineers shipping AI-augmented products",
  painPills = [],
  solutionPills = [],
  insightPills = [],
  knowledgePills = [],
  asOf = new Date().toISOString().slice(0, 10),
  targetWords = 800,
  contextLabel = "",
  targetArchetype = "",
} = {}) {
  if (!Array.isArray(painPills) || painPills.length === 0) {
    throw new Error("at least one pain pill is required");
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const guide = NARRATIVE_ARCHETYPE_GUIDE[targetArchetype];
  if (!guide) {
    throw new Error(`narrative draft requires a known narrative archetype; got "${targetArchetype}". Supported: ${Object.keys(NARRATIVE_ARCHETYPE_GUIDE).join(", ")}`);
  }

  const painSources = painPills.map(fmtPainAsProseSource).join("\n\n");
  const solSources = solutionPills.length ? solutionPills.map(fmtSolutionAsProseSource).join("\n\n") : "(none)";
  const insightBlock = insightPills.length ? insightPills.map(fmtInsight).join("\n") : "(none)";
  const knowledgeBlock = knowledgePills.length ? knowledgePills.map(fmtKnowledge).join("\n") : "(none)";

  const dates = painPills.map(p => p.date).filter(Boolean).sort();
  const earliest = dates[0] || "?";
  const latest = dates[dates.length - 1] || "?";
  const sources = [...new Set(painPills.map(p => p.source).filter(Boolean))];
  const communities = [...new Set([...painPills, ...solutionPills].map(p => p.community).filter(Boolean))];

  const methodology = `*Drawn from ${painPills.length} sourced quotes (${earliest} to ${latest})${solutionPills.length ? ` and ${solutionPills.length} named tool${solutionPills.length === 1 ? "" : "s"}` : ""}${insightPills.length ? `, with ${insightPills.length} field insight${insightPills.length === 1 ? "" : "s"}` : ""}${knowledgePills.length ? ` and ${knowledgePills.length} supporting reference${knowledgePills.length === 1 ? "" : "s"}` : ""}. Sources: ${sources.join(", ") || "mixed"}. Communities: ${communities.slice(0, 6).join(", ") || "various"}${communities.length > 6 ? "…" : ""}. Run date: ${asOf}.*`;

  const prompt = `You are writing a NARRATIVE long-form LinkedIn article (${targetWords - 100}–${targetWords + 100} words) for ${audience}.

This is NOT a pill-format article. NO numbered pain-point lists. NO numbered solution lists. The shape is FLOWING PROSE, with quotes woven into sentences and inline-linked.

## TARGET ARCHETYPE: ${targetArchetype}

**Narrative arc:** ${guide.arc}

**Title hint:** ${guide.title_hint}

## TOPIC
${topic || "(infer from sources below)"}
${contextLabel ? `Context: ${contextLabel}` : ""}

## SOURCES (use real text from these — DO NOT list them as a numbered roll-call; weave them into prose)

### Pain quotes (real user voices with URLs):
${painSources}

### Named tools/products (real with URLs):
${solSources}

### Field insights (incorporate where they fit the arc):
${insightBlock}

### Supporting knowledge (cite in interpretation/conclusion):
${knowledgeBlock}

## REQUIRED ARTICLE STRUCTURE

1. **# Title** (50-80 chars). Follow the title hint for the target archetype.

2. **Lede** (3-4 sentences). Hook + thesis. Open in the archetype's voice.

3. **## [Section 1 — establish the prior state]** (2 paragraphs). Following the narrative arc, set up the "before" or the "received wisdom." Quote 1+ pain or insight inline as part of the prose: \`As one user put it, "[exact phrase](url)" — and the pattern was clear.\`

4. **## [Section 2 — the pivot / counter-evidence / surprising development]** (2 paragraphs). The middle of the arc. Quote 2+ more sources inline.

5. **## [Section 3 — what it means]** (2 paragraphs). Pattern interpretation. Cite 1+ knowledge reference if available.

6. **## What to watch** (1 paragraph). Forward-looking. End with a specific builder/practitioner question (NOT "what do you think?").

7. **Sources line** — copy verbatim:

${methodology}

## CONSTRAINTS

- **NO numbered lists.** No "Pain #1", "Solution #1", no enumerated bullets describing pains/solutions. The whole point is narrative shape.
- **Inline markdown citations** with real text as the link label: \`[exact phrase](url)\`. Minimum 4 distinct citations distributed through the body.
- **Use real numbers** from the source quotes when present (no invented stats).
- **The archetype must LAND** — the LLM-resonance-scorer should detect this article's archetype as the targeted one. Honor the narrative arc structure faithfully.
- No clichés: "game-changer", "revolutionary", "paradigm shift", "the future of", "we live in a world", "unlock the true potential", "10x your productivity".
- Use the EXACT methodology line provided.

Return ONLY the article in markdown. No preamble.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  let text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty narrative article response");
  text = text.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return text;
}
