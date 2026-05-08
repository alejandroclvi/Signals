#!/usr/bin/env node
/**
 * Read the existing portfolio CSV, join each row with its resonance report,
 * extract scores, output an enriched CSV + a comparative analysis table.
 *
 * Usage:
 *   node scripts/portfolio-with-resonance.mjs [date-prefix]
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const datePrefix = process.argv[2] || new Date().toISOString().slice(0, 10);
const portfolioPath = `output/portfolios/${datePrefix}-archetype-portfolio.csv`;
const resonanceDir = "output/resonance";
const outCsv = `output/portfolios/${datePrefix}-archetype-portfolio-scored.csv`;
const outAnalysis = `output/portfolios/${datePrefix}-archetype-analysis.md`;

if (!existsSync(portfolioPath)) {
  console.error(`Portfolio CSV not found: ${portfolioPath}. Run scripts/articles-to-csv.mjs first.`);
  process.exit(1);
}

// ─── CSV parser (RFC 4180-ish, handles quoted fields with commas) ───────────
function parseCsv(text) {
  const rows = [];
  let cur = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
  const header = rows[0];
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function escapeCsv(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ─── Resonance report parser ─────────────────────────────────────────────────
function findResonanceFor(articleFile) {
  const articleBase = path.basename(articleFile, ".md");
  // Resonance file = <date>-<articleBase>-resonance.md
  if (!existsSync(resonanceDir)) return null;
  const matches = readdirSync(resonanceDir).filter(f => f.includes(articleBase) && f.endsWith("-resonance.md"));
  return matches.length ? path.join(resonanceDir, matches[0]) : null;
}

const COMPONENTS = ["overall", "hook", "specificity", "narrative", "contrarian", "readability", "cta", "evidence_density", "archetype_clarity"];

function parseResonance(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  const text = readFileSync(filePath, "utf-8");
  const out = { _file: filePath };

  // Predicted archetype: from "**Predicted archetype:** specific-result-story — _reason_"
  const m = text.match(/\*\*Predicted archetype:\*\*\s*([a-z\-]+)/i);
  out.predicted_archetype = m ? m[1].trim() : "";

  // Score table rows: `| name | \`bar\` 70 | label |` or `| **overall** | \`bar\` 72 | label |`
  for (const c of COMPONENTS) {
    const re = new RegExp(`\\|\\s*(?:\\*\\*)?${c}(?:\\*\\*)?\\s*\\|\\s*\`[^\`]*\`\\s*(\\d+)\\s*\\|`, "i");
    const mm = text.match(re);
    out[`score_${c}`] = mm ? parseInt(mm[1], 10) : null;
  }

  return out;
}

// ─── Main ────────────────────────────────────────────────────────────────────
const portfolio = parseCsv(readFileSync(portfolioPath, "utf-8"));

const enriched = portfolio.map(row => {
  const reso = parseResonance(findResonanceFor(row.file));
  if (!reso) return { ...row, predicted_archetype: "(missing)" };
  return { ...row, predicted_archetype: reso.predicted_archetype, ...Object.fromEntries(COMPONENTS.map(c => [`score_${c}`, reso[`score_${c}`]])) };
});

// Write enriched CSV
const newHeader = Object.keys(enriched[0] || {});
const csv = [
  newHeader.join(","),
  ...enriched.map(r => newHeader.map(h => escapeCsv(r[h])).join(",")),
].join("\n");
mkdirSync(path.dirname(outCsv), { recursive: true });
writeFileSync(outCsv, csv);
console.log(`Wrote enriched CSV → ${outCsv}`);
console.log();

// Console summary table
console.table(enriched.map(r => ({
  context: (r.context || "").slice(0, 24),
  archetype: r.archetype,
  title: (r.title || "").slice(0, 50),
  overall: r.score_overall ?? "?",
  hook: r.score_hook ?? "?",
  specificity: r.score_specificity ?? "?",
  predicted: r.predicted_archetype || "?",
})));
console.log();

// ─── Analysis ────────────────────────────────────────────────────────────────
const lines = [];
lines.push(`# Archetype × Resonance analysis — ${datePrefix}`);
lines.push("");
lines.push(`**Articles analyzed:** ${enriched.length}  ·  **Resonance reports parsed:** ${enriched.filter(r => r.score_overall !== undefined && r.score_overall !== null).length}`);
lines.push("");

// Sort by overall score desc
const byScore = [...enriched]
  .filter(r => r.score_overall !== undefined && r.score_overall !== null)
  .sort((a, b) => (b.score_overall || 0) - (a.score_overall || 0));

lines.push(`## Ranked by overall resonance`);
lines.push("");
lines.push("| Rank | Context | Archetype | Title | Overall | Hook | Specificity | Narrative | Contrarian | Predicted |");
lines.push("|---:|---|---|---|---:|---:|---:|---:|---:|---|");
byScore.forEach((r, i) => {
  const t = (r.title || "").replace(/\|/g, "\\|").slice(0, 70);
  lines.push(`| ${i + 1} | ${r.context.slice(0, 30)} | **${r.archetype}** | ${t} | ${r.score_overall} | ${r.score_hook} | ${r.score_specificity} | ${r.score_narrative} | ${r.score_contrarian} | ${r.predicted_archetype} |`);
});
lines.push("");

// Same-context comparison (claude-code-knowledge-gap)
const ccg = enriched.filter(r => r.context.startsWith("claude-code-knowledge-ga"));
if (ccg.length >= 2) {
  lines.push(`## Same context, different archetypes (${ccg[0].context} — ${ccg.length} variations)`);
  lines.push("");
  lines.push("| Archetype | Overall | Hook | Specificity | Narrative | Contrarian | LLM saw it as |");
  lines.push("|---|---:|---:|---:|---:|---:|---|");
  for (const r of ccg.sort((a, b) => (b.score_overall || 0) - (a.score_overall || 0))) {
    const matches = r.predicted_archetype && r.archetype !== "default" && r.predicted_archetype.startsWith(r.archetype) ? "✓" : "✗";
    lines.push(`| ${r.archetype} | ${r.score_overall} | ${r.score_hook} | ${r.score_specificity} | ${r.score_narrative} | ${r.score_contrarian} | ${r.predicted_archetype} ${matches} |`);
  }
  lines.push("");
  lines.push(`> "LLM saw it as" = the resonance scorer's independent archetype prediction. ✓ means the targeted archetype was actually detected; ✗ means the LLM read it differently.`);
  lines.push("");
}

// Same archetype across contexts
const byArch = {};
for (const r of enriched) {
  if (!byArch[r.archetype]) byArch[r.archetype] = [];
  byArch[r.archetype].push(r);
}
for (const [arch, rows] of Object.entries(byArch)) {
  if (rows.length < 2) continue;
  if (arch === "default") continue;
  lines.push(`## Same archetype across niches (${arch})`);
  lines.push("");
  lines.push("| Context | Overall | Hook | Specificity |");
  lines.push("|---|---:|---:|---:|");
  for (const r of rows) lines.push(`| ${r.context.slice(0, 40)} | ${r.score_overall ?? "?"} | ${r.score_hook ?? "?"} | ${r.score_specificity ?? "?"} |`);
  lines.push("");
}

// Insights paragraphs
lines.push("## Quick reads");
lines.push("");
const top = byScore[0];
if (top) {
  lines.push(`- **Top scorer:** *${top.title}* (${top.archetype}, overall ${top.score_overall}). Strongest dimensions: ${COMPONENTS.filter(c => c !== "overall").map(c => ({ c, s: top[`score_${c}`] })).sort((a,b) => (b.s||0)-(a.s||0)).slice(0,3).map(x => `${x.c} ${x.s}`).join(" · ")}.`);
}
const bottom = byScore[byScore.length - 1];
if (bottom && bottom !== top) {
  lines.push(`- **Lowest scorer:** *${bottom.title}* (${bottom.archetype}, overall ${bottom.score_overall}). Weakest: ${COMPONENTS.filter(c => c !== "overall").map(c => ({ c, s: bottom[`score_${c}`] })).sort((a,b) => (a.s||0)-(b.s||0)).slice(0,3).map(x => `${x.c} ${x.s}`).join(" · ")}.`);
}

// Archetype hit-rate (did the LLM see it as we targeted?)
const targeted = enriched.filter(r => r.archetype && r.archetype !== "default" && r.archetype !== "(unknown)");
const hits = targeted.filter(r => r.predicted_archetype && r.predicted_archetype.startsWith(r.archetype));
if (targeted.length) {
  lines.push(`- **Archetype targeting hit-rate:** ${hits.length}/${targeted.length} — when the predicted archetype matches the targeted one, the LLM honored the structural constraint. Misses suggest the constraint didn't fully land for that variation.`);
}

lines.push("");
lines.push("---");
lines.push(`_Generated ${new Date().toISOString()}_`);
writeFileSync(outAnalysis, lines.join("\n"));
console.log(`Wrote analysis → ${outAnalysis}`);
