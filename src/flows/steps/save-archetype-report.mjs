/**
 * Render an archetype-distribution report — what's working on LinkedIn for
 * THIS context, with recommended target archetype and top authors to study.
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
  "unknown": "?",
};

function bar(pct, max = 100) {
  const n = Math.max(0, Math.min(20, Math.round(pct / max * 20)));
  return "█".repeat(n) + "░".repeat(20 - n);
}

export default async function saveArchetypeReport({
  distribution = { total: 0, distribution: [], top_authors: [], recommended_archetype: null },
  context = "",
  topic = "",
  ingestSummary = null,
  asOf = new Date().toISOString().slice(0, 10),
  outDir = "output/linkedin-radar",
} = {}) {
  const slug = topic ? topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) : context.slice(0, 30);
  const outPath = `${outDir}/${asOf}-${slug}-archetype-distribution.md`;

  const lines = [];
  lines.push(`# LinkedIn archetype distribution — ${context}`);
  lines.push("");
  lines.push(`**Run date:** ${asOf}  `);
  lines.push(`**Topic:** ${topic || "(none — broad sweep)"}  `);
  lines.push(`**Articles ingested into corpus:** ${distribution.total}`);
  if (ingestSummary) {
    lines.push(`**This run:** ${ingestSummary.inserted} new, ${ingestSummary.skipped} duplicate/skipped`);
  }
  lines.push("");

  if (!distribution.total) {
    lines.push("_No LinkedIn articles in the corpus for this context yet. Run linkedin-pulse-ingest with a topic first._");
  } else {
    lines.push(`## Recommended target archetype for next article`);
    lines.push("");
    lines.push(`▸ **${distribution.recommended_archetype || "specific-result"}**  ${CLASS_BADGE[distribution.recommended_archetype] || ""}`);
    lines.push("");
    lines.push("Pass this to article generation as the structural target:");
    lines.push("```");
    lines.push(`pnpm flow run article-from-pain-pills --context ${context} \\`);
    lines.push(`  --targetArchetype "${distribution.recommended_archetype || "specific-result"}"`);
    lines.push("```");
    lines.push("");

    lines.push(`## Archetype distribution`);
    lines.push("");
    lines.push("| Archetype | Count | Share | Avg hook score | Audience mix |");
    lines.push("|---|---:|---|---:|---|");
    for (const d of distribution.distribution) {
      const aud = `${d.audience_mix.broad}b / ${d.audience_mix.tech}t`;
      lines.push(`| ${CLASS_BADGE[d.archetype] || "—"} ${d.archetype} | ${d.count} | \`${bar(d.percentage)}\` ${d.percentage}% | ${d.avg_hook_score} | ${aud} |`);
    }
    lines.push("");

    if (distribution.top_authors?.length) {
      lines.push(`## Top creators in this niche (study their patterns)`);
      lines.push("");
      lines.push("| Author | Articles ingested | Archetypes |");
      lines.push("|---|---:|---|");
      for (const a of distribution.top_authors) {
        const archs = a.archetypes.map(x => CLASS_BADGE[x] || x).join(", ");
        lines.push(`| ${a.author} | ${a.count} | ${archs || "—"} |`);
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(`_Generated ${new Date().toISOString()}_`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, lines.join("\n"));
  return outPath;
}
