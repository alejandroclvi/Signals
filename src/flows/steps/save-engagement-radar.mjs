/**
 * Render an engagement-radar markdown brief for human review.
 * Saves to output/engagement/.
 */

import { writeFileSync, mkdirSync } from "node:fs";

const ENG_BADGE = { comment: "💬 comment", quote: "❝ quote", repost: "🔁 repost", skip: "—" };

export default async function saveEngagementRadar({
  matches = [],
  criteria = "",
  topic_summary = "",
  signalRef = null,
  asOf = new Date().toISOString().slice(0, 10),
  outDir = "output/engagement",
  slug = null,
} = {}) {
  const baseSlug = slug || (signalRef?.title || criteria).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
  const outPath = `${outDir}/${asOf}-${baseSlug}-engagement.md`;

  const lines = [];
  lines.push(`# Engagement radar — ${baseSlug}`);
  lines.push("");
  lines.push(`**Run date:** ${asOf}  `);
  if (signalRef) {
    lines.push(`**Source signal:** \`${signalRef.title}\` (lifecycle: ${signalRef.state || "?"}; ${signalRef.evidence_7d ?? 0}/7d, ${signalRef.evidence_30d ?? 0}/30d)  `);
  }
  lines.push(`**Criteria:** ${criteria}  `);
  lines.push(`**Topic:** ${topic_summary}  `);
  lines.push(`**Candidates passing fit threshold:** ${matches.length}`);
  lines.push("");

  if (!matches.length) {
    lines.push("_No candidates passed the fit threshold. Try widening criteria or increasing perKeyword._");
  } else {
    lines.push("> Tabs are opened in your default browser. Review each — agree with the suggested angle or override.");
    lines.push("");
    lines.push("| ☐ | Fit | Type | Author | Snippet | Suggested angle | Post |");
    lines.push("|---|---:|---|---|---|---|---|");
    for (const m of matches) {
      const snippet = (m.snippet || "").slice(0, 110).replace(/\|/g, "\\|").replace(/\n/g, " ");
      const angle = (m.angle || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      const eng = ENG_BADGE[m.engagement_type] || m.engagement_type;
      lines.push(`| ☐ | ${m.fit_score ?? "?"} | ${eng} | ${m.author_name} | ${snippet}… | ${angle} | [open](${m.post_url}) |`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push(`_Generated ${new Date().toISOString()}_`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, lines.join("\n"));
  return outPath;
}
