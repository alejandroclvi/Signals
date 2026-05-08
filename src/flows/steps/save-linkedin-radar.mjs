/**
 * Render a markdown brief of trending LinkedIn Pulse articles, classified by
 * hook archetype. Saves to output/linkedin-radar/.
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

export default async function saveLinkedinRadar({
  filtered = [],
  classified = [],
  topic = "",
  totalArticles = 0,
  asOf = new Date().toISOString().slice(0, 10),
  outDir = "output/linkedin-radar",
} = {}) {
  const slug = topic ? topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) : "broad";
  const outPath = `${outDir}/${asOf}-${slug}-linkedin-pulse.md`;

  const lines = [];
  lines.push(`# LinkedIn Pulse radar — ${asOf}${topic ? ` — ${topic}` : ""}`);
  lines.push("");
  lines.push(`**Articles discovered:** ${totalArticles}  ·  **Surfaced (score ≥ threshold):** ${filtered.length}`);
  lines.push("");
  lines.push("> Real LinkedIn Pulse articles published in your niche, classified by hook archetype.");
  lines.push("> Each surfaced row = a title that already proved publishable. Steal the *pattern*, not the words.");
  lines.push("");

  if (!filtered.length) {
    lines.push("_No articles cleared the threshold. Try a different topic, lower --minScore, or check that DDG returned results._");
  } else {
    lines.push("| ☐ | Score | Class | Audience | Title (LinkedIn link) | Your version template |");
    lines.push("|---|---:|---|---|---|---|");
    for (const h of filtered) {
      const badge = CLASS_BADGE[h.narrative_class] || "—";
      const titleEsc = (h.title || "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 110);
      const tpl = (h.linkedin_template || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      const meta = `discovered via: \`${h.query?.slice(0, 60) || "?"}\``;
      lines.push(`| ☐ | ${h.hook_score} | ${badge} ${h.narrative_class} | ${h.audience_breadth} | [${titleEsc}](${h.url})<br><sub>${meta}</sub> | ${tpl} |`);
    }
  }

  if (classified.length) {
    const byClass = {};
    for (const c of classified) byClass[c.narrative_class] = (byClass[c.narrative_class] || 0) + 1;
    lines.push("");
    lines.push(`**Class distribution (all ${classified.length} classified):**`);
    for (const [k, v] of Object.entries(byClass).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${CLASS_BADGE[k] || "—"} ${k}: ${v}`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push(`_Generated ${new Date().toISOString()}_`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, lines.join("\n"));
  return outPath;
}
