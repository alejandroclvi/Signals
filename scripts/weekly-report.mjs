#!/usr/bin/env node
/**
 * Weekly Signal Brief — runs every analytical query that the architecture supports
 * and emits one markdown document.
 *
 * Sections:
 *   1. Heat map      — context-level velocity z-score
 *   2. Source mix    — what evidence layers are populated
 *   3. Top per lens  — top 3 signals per lens per multi-source context
 *   4. Cross-context — communities feeding multiple theses
 *   5. Polymarket    — markets being tracked, current probabilities
 *   6. Limits        — what the data can't say yet
 *
 * Usage: node scripts/weekly-report.mjs [--asOf YYYY-MM-DD] [--out path]
 */

import "../src/lib/env.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getDb } from "../src/db/connection.mjs";
import {
  themeVelocity,
  contextSourceMix,
  communitiesAcrossContexts,
  corpusSourceMix,
} from "../src/graph/insights.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--asOf") args.asOf = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

function pad(s, n) { return String(s).padEnd(n); }
function num(n, dp = 2) { return n === null || n === undefined ? "—" : Number(n).toFixed(dp); }

async function main() {
  const args = parseArgs(process.argv);
  const asOf = args.asOf || "2026-04-21";
  const outPath = args.out || `output/weekly-brief-${asOf}.md`;

  const db = getDb();
  const ctxs = db.prepare(`
    SELECT id, label FROM contexts
    WHERE id IN (SELECT DISTINCT context_id FROM evidence_packets)
    ORDER BY label
  `).all();

  const out = [];
  out.push(`# Signals — Weekly Brief — ${asOf}`);
  out.push("");
  out.push("> Auto-generated from the multi-source evidence graph. Numbers are real, prose is mechanical — read it as a dashboard, not an essay.");
  out.push("");
  out.push("---");
  out.push("");

  // ─── Section 1: Heat Map ─────────────────────────────────────────────────
  out.push("## 1. Heat map — which contexts are moving");
  out.push("");
  out.push("Velocity = recent 14-day daily evidence rate vs. baseline (76 days). Z-score is the standardized change.");
  out.push("");
  out.push("| Context | Top theme | Recent/d | Baseline/d | Δ% | z | State |");
  out.push("|---|---|---:|---:|---:|---:|---|");

  const heatRows = [];
  for (const c of ctxs) {
    let rows = [];
    try { rows = await themeVelocity(c.id, { asOf }); } catch { /* skip */ }
    if (!rows.length) continue;
    const r = rows[0];
    const pct = r.pctChange !== null && r.pctChange !== undefined ? `${(r.pctChange * 100).toFixed(0)}%` : "—";
    const state = r.zScore >= 1 ? "🔥 hot" : r.zScore >= 0.3 ? "↑ rising" : r.zScore <= -0.3 ? "↓ fading" : "· flat";
    heatRows.push({ label: c.label, theme: r.theme, recent: r.recentAvg, baseline: r.baselineAvg, pct, z: r.zScore, state });
  }
  heatRows.sort((a, b) => (b.z || 0) - (a.z || 0));
  for (const r of heatRows) {
    out.push(`| ${r.label.slice(0, 60)} | ${r.theme} | ${num(r.recent)} | ${num(r.baseline)} | ${r.pct} | ${num(r.z)} | ${r.state} |`);
  }
  out.push("");

  // ─── Section 2: Source Mix ────────────────────────────────────────────────
  out.push("## 2. Source mix — where the evidence comes from");
  out.push("");
  const corpus = await corpusSourceMix();
  out.push("**Whole corpus:**");
  out.push("");
  out.push("| Source | Layer | Evidence | Contexts |");
  out.push("|---|---|---:|---:|");
  for (const r of corpus) {
    out.push(`| ${r.source || "(unset)"} | ${r.layer || "—"} | ${r.evidence.toLocaleString()} | ${r.contextsCovered} |`);
  }
  out.push("");

  // Per-context source mix
  out.push("**Per multi-source context:**");
  out.push("");
  for (const c of ctxs) {
    const mix = await contextSourceMix(c.id);
    if (mix.length < 2) continue;
    out.push(`- **${c.label}** — ${mix.map(m => `${m.source}:${m.evidence.toLocaleString()}`).join(" · ")}`);
  }
  out.push("");

  // ─── Section 3: Top per lens ──────────────────────────────────────────────
  out.push("## 3. Top signals per lens — same evidence, six rankings");
  out.push("");
  out.push("Computed from `signal_scores`. The same signal can rank differently under different lenses; biggest divergences are highlighted.");
  out.push("");

  const lenses = ["research", "content", "ads", "competitive", "product", "capital"];
  const ctxsWithScores = db.prepare(`
    SELECT DISTINCT s.context_id AS id, c.label AS label
    FROM signal_scores ss
    JOIN signals s ON s.id = ss.signal_id
    JOIN contexts c ON c.id = s.context_id
  `).all();

  for (const c of ctxsWithScores) {
    out.push(`### ${c.label}`);
    out.push("");
    const top = db.prepare(`
      SELECT ss.lens, ss.rank_in_ctx, ss.total, s.title
      FROM signal_scores ss
      JOIN signals s ON s.id = ss.signal_id
      WHERE s.context_id = ? AND ss.rank_in_ctx <= 3
      ORDER BY ss.lens, ss.rank_in_ctx
    `).all(c.id);
    if (!top.length) continue;
    const byLens = {};
    for (const r of top) (byLens[r.lens] = byLens[r.lens] || []).push(r);

    out.push("| Lens | #1 | #2 | #3 |");
    out.push("|---|---|---|---|");
    for (const lens of lenses) {
      const rows = byLens[lens];
      if (!rows) continue;
      const sorted = rows.sort((a, b) => a.rank_in_ctx - b.rank_in_ctx);
      const cell = (r) => r ? `${r.title.slice(0, 35)} (${r.total})` : "—";
      out.push(`| ${lens} | ${cell(sorted[0])} | ${cell(sorted[1])} | ${cell(sorted[2])} |`);
    }
    out.push("");

    // Rank divergence — signals where top-3 in one lens but >5 in another
    const divergent = db.prepare(`
      SELECT s.title, s.id,
             MIN(ss.rank_in_ctx) AS min_rank,
             MAX(ss.rank_in_ctx) AS max_rank
      FROM signal_scores ss
      JOIN signals s ON s.id = ss.signal_id
      WHERE s.context_id = ?
      GROUP BY s.id, s.title
      HAVING min_rank <= 3 AND max_rank - min_rank >= 3
      ORDER BY max_rank - min_rank DESC
      LIMIT 5
    `).all(c.id);
    if (divergent.length) {
      out.push("**Lens divergence (top-3 in one lens, ≥+3 ranks worse in another):**");
      out.push("");
      for (const d of divergent) {
        const lensRanks = db.prepare(`SELECT lens, rank_in_ctx FROM signal_scores WHERE signal_id = ? ORDER BY lens`).all(d.id);
        out.push(`- ${d.title} — ${lensRanks.map(r => `${r.lens}#${r.rank_in_ctx}`).join(", ")}`);
      }
      out.push("");
    }
  }

  // ─── Section 4: Cross-context communities ─────────────────────────────────
  out.push("## 4. Shared listening posts — communities feeding multiple theses");
  out.push("");
  const shared = await communitiesAcrossContexts({ minContexts: 2, minEvidence: 5 });
  if (shared.length === 0) {
    out.push("_No communities are currently shared across ≥2 contexts with ≥5 evidence packets._");
  } else {
    out.push("| Community | Source | Contexts | Evidence |");
    out.push("|---|---|---:|---:|");
    for (const r of shared.slice(0, 15)) {
      const ctxList = r.distribution.map(d => `${d.context.slice(0, 24)}(${d.evidence})`).join(", ");
      out.push(`| ${r.community} | ${r.source} | ${r.contextCount} (${ctxList}) | ${r.totalEvidence} |`);
    }
  }
  out.push("");

  // ─── Section 5: Polymarket watch ─────────────────────────────────────────
  out.push("## 5. Polymarket watch — current expectation snapshots");
  out.push("");
  const pmRows = db.prepare(`
    SELECT context_id, title, body, evidence_state, evidence_weight, metrics
    FROM evidence_packets
    WHERE source_id = 'polymarket'
    ORDER BY context_id, evidence_weight DESC
  `).all();

  if (!pmRows.length) {
    out.push("_No Polymarket evidence in DB._");
  } else {
    // De-dupe by market title; collect contexts per market
    const byMarket = new Map();
    for (const r of pmRows) {
      const t = r.title;
      if (!byMarket.has(t)) byMarket.set(t, { row: r, contexts: new Set() });
      byMarket.get(t).contexts.add(r.context_id);
    }
    out.push("| Market | Probability | 24h Volume | State | Tracked in |");
    out.push("|---|---:|---:|---|---|");
    const sorted = [...byMarket.values()].sort((a, b) => {
      const ma = (() => { try { return JSON.parse(a.row.metrics); } catch { return {}; } })();
      const mb = (() => { try { return JSON.parse(b.row.metrics); } catch { return {}; } })();
      return (mb.volume24h || 0) - (ma.volume24h || 0);
    });
    for (const { row, contexts } of sorted) {
      const m = (() => { try { return JSON.parse(row.metrics); } catch { return {}; } })();
      const prob = m.probability !== undefined ? `${(m.probability * 100).toFixed(1)}%` : "—";
      const vol = m.volume24h ? `$${Math.round(m.volume24h).toLocaleString()}` : "—";
      const ctxList = [...contexts].length === 1 ? [...contexts][0].slice(0, 30) : `${contexts.size} contexts`;
      out.push(`| ${(row.title || "").slice(0, 65)} | ${prob} | ${vol} | ${row.evidence_state || "—"} | ${ctxList} |`);
    }
  }
  out.push("");

  // ─── Section 6: Honest limitations ──────────────────────────────────────
  out.push("## 6. What this report cannot say yet");
  out.push("");
  const nullStates = db.prepare(`
    SELECT context_id, COUNT(*) AS unclassified
    FROM evidence_packets
    WHERE evidence_state IS NULL OR evidence_state = ''
    GROUP BY context_id
    ORDER BY unclassified DESC LIMIT 5
  `).all();

  out.push("- **Signal extraction is Reddit-only.** HN and Polymarket evidence is in the graph but not yet linked to signals via `SUPPORTS` edges. Run signal re-extraction on multi-source evidence to fix.");
  out.push("- **Lead-lag analysis is structurally available but empty** until the above is done.");
  out.push("- **Polymarket-vs-conversation divergence** depends on `evidence_state` being LLM-classified for HN evidence. Top contexts with unclassified evidence:");
  for (const r of nullStates.slice(0, 5)) {
    out.push(`  - \`${r.context_id}\` — ${r.unclassified} packets`);
  }
  out.push("- **Polymarket AI market universe is thin** (≈20 active AI markets out of 500). Most volume is sports/politics. Manual `--slugs` curation is the only reliable approach right now.");
  out.push("- **Theme labels are too coarse** (six generic tags: frustration, demand, comparison, adoption, economic, narrative). Specific themes like 'cost of running Claude Code' or 'context window blowout' live in `signal_facets` and `signal_phrases` but aren't yet projected into the graph.");
  out.push("");

  out.push("---");
  out.push(`_Generated ${new Date().toISOString()}_`);
  out.push("");

  // Write
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, out.join("\n"));
  console.log(`Wrote ${outPath}  (${out.length} lines)`);
}

main().catch(err => { console.error(err); process.exit(1); });
