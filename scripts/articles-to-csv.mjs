#!/usr/bin/env node
/**
 * Walk output/articles/ for pill-format article markdown files matching a date
 * pattern, extract title + first-paragraph intro + meta, write a CSV.
 *
 * Usage:
 *   node scripts/articles-to-csv.mjs [date-prefix] [out-path]
 *   node scripts/articles-to-csv.mjs 2026-05-08
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_DIR = "output/articles";
const datePrefix = process.argv[2] || new Date().toISOString().slice(0, 10);
const outPath = process.argv[3] || `output/portfolios/${datePrefix}-archetype-portfolio.csv`;

function escapeCsv(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // RFC 4180-ish: quote if contains comma/quote/newline; double-quote internal quotes
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseArticle(filePath, fileName) {
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split("\n");
  let title = "";
  let introLines = [];
  let mode = "before-title";

  for (const ln of lines) {
    if (mode === "before-title") {
      // Accept any heading level for the first heading (LLMs sometimes use ## instead of #)
      const t = ln.match(/^#{1,3}\s+(.+)$/);
      if (t) { title = t[1].trim(); mode = "after-title-blank"; }
      continue;
    }
    if (mode === "after-title-blank") {
      if (ln.trim() === "") continue;
      // First non-blank after title — start of intro
      mode = "intro";
    }
    if (mode === "intro") {
      // Stop at next heading or blank line
      if (/^#+\s/.test(ln) || ln.trim() === "") break;
      introLines.push(ln);
    }
  }

  const intro = introLines.join(" ").replace(/\s+/g, " ").trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Filename patterns:
  //   <date>-<context>-<archetype>-pill.md          → pill generator, archetype-targeted
  //   <date>-<context>-<archetype>-narrative.md     → narrative generator, archetype-targeted
  //   <date>-<context>-pill-article.md              → legacy default pill (no archetype)
  const base = fileName.replace(/\.md$/i, "");
  let date = "", contextAndArch = "", generator = "pill";
  let m = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)-(pill|narrative)$/);
  if (m) { date = m[1]; contextAndArch = m[2]; generator = m[3]; }
  else {
    const m2 = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)-pill-article$/);
    if (m2) { date = m2[1]; contextAndArch = m2[2] + "-default"; generator = "pill"; }
  }

  // The last hyphen-segment is the archetype slug; rest is context.
  // Known archetypes (filename slug form):
  const knownArchSlugs = [
    "specific-result", "contrarian-insider", "geopolitical-bridge",
    "comparison-deep", "dying-king", "underdog-winning", "origin-story",
    "post-mortem", "meta-narrative", "default",
  ];
  let context = contextAndArch, archetype = "";
  for (const a of knownArchSlugs) {
    if (contextAndArch.endsWith("-" + a)) {
      context = contextAndArch.slice(0, -1 - a.length);
      archetype = a;
      break;
    }
  }
  if (!archetype) archetype = "(unknown)";

  return { date, context, archetype, generator, title, intro, word_count: wordCount, file: filePath };
}

function listArticles(dir, datePrefix) {
  const files = readdirSync(dir);
  return files
    .filter(f => f.startsWith(datePrefix))
    .filter(f => f.endsWith(".md"))
    .filter(f => /-(pill|narrative)\.md$/.test(f) || /pill-article\.md$/.test(f))
    .map(f => path.join(dir, f))
    .sort();
}

function main() {
  const files = listArticles(DEFAULT_DIR, datePrefix);
  if (!files.length) {
    console.error(`No matching articles found in ${DEFAULT_DIR} starting with "${datePrefix}".`);
    process.exit(1);
  }

  const rows = files.map(p => parseArticle(p, path.basename(p)));
  const header = ["date", "context", "archetype", "generator", "title", "intro", "word_count", "file"];
  const csv = [
    header.join(","),
    ...rows.map(r => header.map(h => escapeCsv(r[h])).join(",")),
  ].join("\n");

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, csv);
  console.log(`Wrote ${rows.length} rows → ${outPath}`);
  console.table(rows.map(r => ({
    context: r.context.slice(0, 24),
    archetype: r.archetype,
    title: r.title.slice(0, 60),
  })));
}

main();
