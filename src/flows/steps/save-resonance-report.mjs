/**
 * Render a markdown resonance report combining scores, fixes, and hook variants.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

function bar(score) {
  const n = Math.max(0, Math.min(100, score || 0));
  const filled = Math.round(n / 5);  // out of 20
  return "█".repeat(filled) + "░".repeat(20 - filled);
}

function gradeLabel(score) {
  if (score >= 85) return "🟢 strong";
  if (score >= 70) return "🟡 good";
  if (score >= 55) return "🟠 mid";
  return "🔴 weak";
}

export default async function saveResonanceReport({
  scoring = {},
  variants = [],
  articlePath = "",
  asOf = new Date().toISOString().slice(0, 10),
  outDir = "output/resonance",
} = {}) {
  const slug = articlePath ? path.basename(articlePath, ".md") : "untitled";
  const outPath = `${outDir}/${asOf}-${slug}-resonance.md`;

  const s = scoring.scores || {};
  const lines = [];
  lines.push(`# Resonance report — ${slug}`);
  lines.push("");
  lines.push(`**Article:** \`${articlePath}\`  `);
  lines.push(`**Run date:** ${asOf}  `);
  lines.push(`**Predicted archetype:** ${scoring.archetype_predicted || "?"}${scoring.archetype_reason ? ` — _${scoring.archetype_reason}_` : ""}`);
  lines.push("");

  // ── Scores ──
  lines.push(`## Scores`);
  lines.push("");
  lines.push("| Component | Score | Grade |");
  lines.push("|---|---|---|");
  const order = ["overall", "hook", "specificity", "narrative", "contrarian", "readability", "cta", "evidence_density", "archetype_clarity"];
  for (const k of order) {
    if (s[k] === undefined) continue;
    lines.push(`| ${k === "overall" ? "**overall**" : k} | \`${bar(s[k])}\` ${s[k]} | ${gradeLabel(s[k])} |`);
  }
  lines.push("");

  // ── Strengths / Weaknesses ──
  if (scoring.strengths?.length) {
    lines.push(`## What's working`);
    lines.push("");
    for (const x of scoring.strengths) lines.push(`- ✓ ${x}`);
    lines.push("");
  }
  if (scoring.weaknesses?.length) {
    lines.push(`## What's not working`);
    lines.push("");
    for (const x of scoring.weaknesses) lines.push(`- ✗ ${x}`);
    lines.push("");
  }

  // ── Suggested fixes ──
  if (scoring.suggested_fixes?.length) {
    lines.push(`## Suggested fixes (line-edit level)`);
    lines.push("");
    scoring.suggested_fixes.forEach((f, i) => {
      lines.push(`### Fix ${i + 1} — ${f.component}`);
      lines.push("");
      lines.push(`**Current:** ${f.current ? `> ${f.current}` : "_(general note)_"}`);
      lines.push("");
      lines.push(`**Suggestion:** ${f.suggestion}`);
      lines.push("");
      lines.push(`_Why:_ ${f.reason}`);
      lines.push("");
    });
  }

  // ── Hook variants ──
  if (variants.length) {
    lines.push(`## Alternative opening hooks (5 archetypes)`);
    lines.push("");
    lines.push(`Each variant's first 14 words show — that's what LinkedIn mobile shows before "see more". Pick the one whose teaser earns the click.`);
    lines.push("");
    for (const v of variants) {
      lines.push(`### ${v.archetype}`);
      lines.push("");
      lines.push(`> ${v.hook_text}`);
      lines.push("");
      lines.push(`**First 14 (mobile):** _${v.first_14_words}_`);
      lines.push("");
      if (v.why_this_works) lines.push(`✓ **Why:** ${v.why_this_works}  `);
      if (v.risk) lines.push(`⚠ **Risk:** ${v.risk}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(`_Generated ${new Date().toISOString()}_`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, lines.join("\n"));
  return outPath;
}
