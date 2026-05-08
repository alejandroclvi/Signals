/**
 * Render a markdown table of (name, profile, source-keyword, draft message)
 * for human review before any LinkedIn send. Saves to output/distribution/.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export default async function saveDistributionList({
  drafts = [],
  articlePath = null,
  outDir = "output/distribution",
  asOf = new Date().toISOString().slice(0, 10),
  topic_summary = "",
  audience_descriptor = "",
} = {}) {
  const slug = articlePath
    ? path.basename(articlePath, ".md")
    : `untitled-${Date.now()}`;
  const outPath = `${outDir}/${asOf}-${slug}-linkedin-distribution.md`;

  const lines = [];
  lines.push(`# LinkedIn distribution list — ${slug}`);
  lines.push("");
  lines.push(`**Run date:** ${asOf}  `);
  lines.push(`**Audience:** ${audience_descriptor}  `);
  lines.push(`**Topic:** ${topic_summary}  `);
  lines.push(`**Article:** \`${articlePath || "(none)"}\`  `);
  lines.push(`**Profiles drafted:** ${drafts.length}`);
  lines.push("");
  lines.push("> ⚠️ Review every draft before sending. The system does NOT auto-DM.");
  lines.push("> To actually send: copy/paste manually, or use `pnpm flow run linkedin-send-dm --to <profile-url> --message \"...\"` (one at a time, with confirmation).");
  lines.push("");
  lines.push("| ☐ | Name | Profile | Matched on | Draft DM |");
  lines.push("|---|---|---|---|---|");
  for (const d of drafts) {
    const msg = (d.message || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(`| ☐ | ${d.name} | [${d.url.replace("https://www.linkedin.com/in/", "")}](${d.url}) | ${d.source_keyword || "—"} | ${msg} |`);
  }
  lines.push("");
  lines.push(`---`);
  lines.push(`_Generated ${new Date().toISOString()}_`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, lines.join("\n"));
  return outPath;
}
