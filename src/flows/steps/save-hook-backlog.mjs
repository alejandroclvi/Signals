/**
 * Save a markdown backlog of LinkedIn-ready hooks for human review.
 */

import { writeFileSync, mkdirSync } from "node:fs";

const CLASS_BADGE = {
  "contrarian-insider": "🕵️",
  "geopolitical-bridge": "🌐",
  "dying-king": "👑",
  "underdog-winning": "🏃",
  "origin-story": "📜",
  "meta-narrative": "🪞",
  "specific-result": "📊",
  "other": "—",
};

export default async function saveHookBacklog({
  filtered = [],
  classified = [],
  topic = "",
  totalConsidered = 0,
  asOf = new Date().toISOString().slice(0, 10),
  outDir = "output/hook-backlog",
} = {}) {
  const slug = topic ? topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) : "broad";
  const outPath = `${outDir}/${asOf}-${slug}-hooks.md`;

  const lines = [];
  lines.push(`# Hook radar — ${asOf}${topic ? ` — ${topic}` : ""}`);
  lines.push("");
  lines.push(`**Considered:** ${totalConsidered} titles  ·  **Surfaced:** ${filtered.length} (score ≥ threshold)`);
  lines.push("");
  lines.push("> Each row is a real Reddit/HN post whose **title** scored well as a standalone LinkedIn hook. Steal the pattern, not the words.");
  lines.push("");

  if (!filtered.length) {
    lines.push("_No hooks crossed the threshold this run. Try lowering --minScore or --topic._");
  } else {
    lines.push("| ☐ | Score | Class | Audience | Hook (source) | Your version template |");
    lines.push("|---|---:|---|---|---|---|");
    for (const h of filtered) {
      const badge = CLASS_BADGE[h.narrative_class] || "—";
      const titleEsc = (h.title || "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 100);
      const tpl = (h.linkedin_template || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      const meta = `${h.community} · ${h.upvotes || "?"} ↑ · ${h.date}`;
      lines.push(`| ☐ | ${h.hook_score} | ${badge} ${h.narrative_class} | ${h.audience_breadth} | [${titleEsc}](${h.url})<br><sub>${meta}</sub> | ${tpl} |`);
    }
  }

  // Class distribution summary at the bottom
  if (classified.length) {
    const byClass = {};
    for (const c of classified) byClass[c.narrative_class] = (byClass[c.narrative_class] || 0) + 1;
    lines.push("");
    lines.push(`**Class distribution (all ${classified.length} considered):**`);
    for (const [k, v] of Object.entries(byClass).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${CLASS_BADGE[k] || "—"} ${k}: ${v}`);
    }
  }
  lines.push("");
  lines.push(`---`);
  lines.push(`_Generated ${new Date().toISOString()}_`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, lines.join("\n"));
  return outPath;
}
