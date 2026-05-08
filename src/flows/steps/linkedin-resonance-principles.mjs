/**
 * Codified LinkedIn engagement principles. Static knowledge — referenced by
 * score-resonance and generate-hook-variants.
 *
 * Each principle has:
 *   id, rule, why, tactics[], pitfalls[]
 *
 * The principles are tuned for long-form LinkedIn articles (700-1200 words),
 * not feed posts. For feed-post tuning, see future feed-resonance variant.
 */

export const PRINCIPLES = {
  hook_first_lines: {
    rule: "The first 1-2 lines must trigger the 'see more' click on mobile (~14 words / ~150 chars visible).",
    why: "LinkedIn's mobile feed truncates after ~150 characters. Without click-through, no engagement signal.",
    tactics: [
      "Open with a specific surprising number or dollar amount",
      "Open with a contrarian claim that the reader knows is partly true",
      "Open with a personal stake / failure story in 8-12 words",
      "Open with a question whose answer isn't obvious from the title",
    ],
    pitfalls: [
      "Generic openings ('In today's fast-paced world…')",
      "Buzzword stacks ('AI-driven, data-informed, cloud-native…')",
      "Long setup before the hook lands",
    ],
  },
  specificity: {
    rule: "Concrete numbers, dollar amounts, time spans, and named entities outperform abstractions.",
    why: "LinkedIn audiences scroll fast. Specifics survive scrolling; abstractions don't.",
    tactics: [
      "Replace 'a lot of' with the actual count or percentage",
      "Name real tools/companies/people instead of categories",
      "Cite a date or duration ('over 6 weeks' beats 'over time')",
      "Quote real numbers from your evidence — sourced > confident-sounding",
    ],
    pitfalls: [
      "Inventing numbers to sound specific",
      "Specificity that isn't load-bearing (irrelevant detail)",
    ],
  },
  narrative_arc: {
    rule: "A story with stakes, conflict, and resolution outperforms a list of points.",
    why: "Narrative compels readers to finish. Reading completion drives algorithmic dwell-time signal.",
    tactics: [
      "Open with the moment of decision/failure/realization",
      "Show the cost (time/money/reputation) of getting it wrong",
      "Resolve with a specific action you took (or are taking)",
      "First-person where appropriate; avoid passive voice",
    ],
    pitfalls: [
      "Pure list posts (1, 2, 3, 4, 5) without a binding narrative",
      "Hero-narrative ('I figured it out so you don't have to')",
    ],
  },
  contrarian_tact: {
    rule: "Posts that challenge received wisdom outperform consensus posts — but only when the contrarian claim is grounded.",
    why: "LinkedIn's algorithm rewards comments. Disagreement drives comments. Grounded contrarian claims invite engagement; ungrounded ones invite dunks.",
    tactics: [
      "Take a position the reader's audience publicly assumes is true",
      "Show the specific evidence that contradicts it",
      "Acknowledge the steel-man before refuting",
    ],
    pitfalls: [
      "Hot takes without evidence",
      "Punching down ('founders who do X are wrong')",
      "False contrarianism — disagreeing with strawmen",
    ],
  },
  readability: {
    rule: "Short paragraphs (1-3 sentences). White space. Bullet lists used sparingly.",
    why: "LinkedIn renders on mobile-first; walls of text tank scroll completion.",
    tactics: [
      "Break paragraphs at 2-3 sentences",
      "Use blank lines between paragraphs",
      "Use bullet lists for parallel items (3-5 max)",
      "Bold key phrases sparingly (every 100-200 words)",
    ],
    pitfalls: [
      "Over-formatting (every line bold)",
      "Long unbroken paragraphs",
      "Listicle-style numbered points without context",
    ],
  },
  cta_drives_comments: {
    rule: "End with a specific question that invites a builder/practitioner response, not a generic 'what do you think?'",
    why: "LinkedIn algorithm weights comments more than likes. Specific questions get specific replies.",
    tactics: [
      "Ask about a specific decision the reader has likely made ('which X did you pick — A, B, or build your own?')",
      "Ask for opposing experience ('has anyone seen the opposite of this?')",
      "Ask for a specific number ('how many X are you running today?')",
    ],
    pitfalls: [
      "'What do you think?' — no anchor",
      "'Agree?' — yes-no questions die",
      "Multiple questions at once",
    ],
  },
  evidence_density: {
    rule: "Every claim should be either sourced (link or quote) or clearly your opinion. Mixed undercuts authority.",
    why: "Professional audiences detect authority signals — uncited generality reads as bluster.",
    tactics: [
      "Inline-link your sources where the claim lands",
      "Use 'I think' or 'in my experience' to mark opinion",
      "Quote real text from real users (use the exact words)",
    ],
    pitfalls: [
      "Stat-dropping without sources",
      "Hedging on real claims ('many people are saying')",
    ],
  },
  archetype_clarity: {
    rule: "The article should have ONE dominant archetype, not three blended.",
    why: "Mixed archetypes blur the takeaway. Readers should leave with one specific idea.",
    archetypes: [
      "contrarian-insider — 'X is doing Y; here's the real story'",
      "specific-result-story — 'I did X for N weeks. Here's what happened.'",
      "category-naming — 'There's a pattern forming. Let me name it.'",
      "post-mortem — 'Here's why this approach failed.'",
      "field-report — 'I'm tracking X across N sources. Here's the trend.'",
      "comparison-deep — 'X vs Y: I've used both. Here's the actual difference.'",
    ],
  },
};

export function principlesAsPrompt() {
  // Compact form for inclusion in LLM prompts
  const lines = [];
  for (const [id, p] of Object.entries(PRINCIPLES)) {
    lines.push(`- **${id}**: ${p.rule}`);
    if (p.tactics?.length) lines.push(`  tactics: ${p.tactics.slice(0, 3).join("; ")}`);
    if (p.pitfalls?.length) lines.push(`  pitfalls: ${p.pitfalls.slice(0, 2).join("; ")}`);
  }
  return lines.join("\n");
}

export default PRINCIPLES;
