/**
 * Step: save-unified-brief.
 *
 * Persists each synthesized topic into the unified_signals + unified_signal_evidence
 * tables, and writes a human-readable multi-topic briefing to output/.
 *
 * Args: { context, synthesized, asOf? }
 * Returns: { savedCount, mdPath }
 */

import "../../lib/env.mjs";
import { getDb } from "../../db/connection.mjs";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

const LAYER_LABEL = {
  truth: "Primary truth",
  conversation: "Conversation",
  intent: "Intent",
  behavior: "Behavior",
  expectation: "Expectation",
  economic: "Economic commitment",
  capital: "Capital-market response",
};
const LAYER_ORDER = ["truth", "conversation", "intent", "behavior", "expectation", "economic", "capital"];

function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

function formatTemporalBadge(state) {
  if (state === "early")   return "🌱 EARLY";
  if (state === "current") return "🔥 CURRENT";
  if (state === "late")    return "🌒 LATE";
  return "?";
}

function renderMarkdown({ ctxLabel, asOf, synthesized }) {
  const lines = [];
  lines.push(`# Unified Intelligence Brief — ${ctxLabel}`);
  lines.push(`**${asOf}** · ${synthesized.length} topics · multi-layer cross-corroborated synthesis`);
  lines.push("");
  lines.push("> Each topic below pulls evidence from up to 7 independent layers (truth, conversation, intent, behavior, expectation, economic, capital) and a synthesizer agent integrates them into one story with temporal classification (early / current / late) and recommended monitoring actions.");
  lines.push("");

  // Triage table at the top
  lines.push("## Triage — what to watch by temporal state");
  lines.push("");
  lines.push("| State | Topic | Corroboration | Layers | Velocity |");
  lines.push("|---|---|---:|---:|---|");
  const states = ["early", "current", "late"];
  for (const state of states) {
    const matches = synthesized.filter(s => s.synthesis?.temporal_state === state);
    for (const s of matches) {
      const lc = Object.values(s.layerCoverage || {}).filter(v => v > 0).length;
      const corro = (s.synthesis?.corroboration_score ?? 0).toFixed(2);
      const vel = s.temporal?.velocity_state || "?";
      lines.push(`| ${formatTemporalBadge(state)} | ${s.topic.name} | ${corro} | ${lc}/7 | ${vel} |`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // Full per-topic details
  for (const s of synthesized) {
    const syn = s.synthesis || {};
    lines.push(`## ${formatTemporalBadge(syn.temporal_state)} — ${s.topic.name}`);
    lines.push("");
    if (s.topic.description) lines.push(`*${s.topic.description}*`);
    lines.push("");
    if (syn.thesis) {
      lines.push(`**Thesis.** ${syn.thesis}`);
      lines.push("");
    }

    if (s.temporal) {
      lines.push(`**Temporal signature.** First detected ${s.temporal.first_detected || "?"} · peak ${s.temporal.peak_at || "?"} (loudest layer: ${s.temporal.peak_layer || "—"}) · breadth ${s.temporal.layer_breadth}/7 · velocity ${s.temporal.velocity_14d_vs_60d}× (${s.temporal.velocity_state}).`);
      if (syn.temporal_reasoning) lines.push(`*Reasoning:* ${syn.temporal_reasoning}`);
      lines.push("");
    }

    lines.push(`**Corroboration score:** ${(syn.corroboration_score ?? 0).toFixed(2)}`);
    lines.push("");

    if (syn.layer_analysis) {
      lines.push("### What each layer says");
      lines.push("");
      for (const layer of LAYER_ORDER) {
        const analysis = (syn.layer_analysis[layer] || "").trim();
        const count = s.layerCoverage?.[layer] || 0;
        if (!analysis && count === 0) continue;
        const label = LAYER_LABEL[layer];
        if (analysis) {
          lines.push(`- **${label}** (${count} evidence): ${analysis}`);
        } else {
          lines.push(`- **${label}** (${count} evidence): _no analysis_`);
        }
      }
      lines.push("");
    }

    if (Array.isArray(syn.missing_evidence) && syn.missing_evidence.length) {
      lines.push("### Missing evidence (what would sharpen this)");
      for (const m of syn.missing_evidence) lines.push(`- ${m}`);
      lines.push("");
    }

    if (Array.isArray(syn.recommended_actions) && syn.recommended_actions.length) {
      lines.push("### Recommended actions");
      for (const a of syn.recommended_actions) {
        if (typeof a === "string") lines.push(`- ${a}`);
        else lines.push(`- **${a.action}** — ${a.why || ""}`);
      }
      lines.push("");
    }

    if (Array.isArray(s.topic.key_terms) && s.topic.key_terms.length) {
      lines.push(`*Key terms tracked:* \`${s.topic.key_terms.join("` · `")}\``);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export default async function saveUnifiedBrief({
  context,
  synthesized,
  asOf,
} = {}) {
  if (!context) throw new Error("context is required");
  if (!Array.isArray(synthesized) || !synthesized.length) {
    return { savedCount: 0, mdPath: null };
  }

  const db = getDb();
  const day = asOf || new Date().toISOString().slice(0, 10);
  const ctxRow = db.prepare("SELECT id, label FROM contexts WHERE id = ?").get(context);
  if (!ctxRow) throw new Error(`Context not found: ${context}`);

  const insertSig = db.prepare(`
    INSERT OR REPLACE INTO unified_signals
      (id, context_id, topic, description, thesis, temporal_state, temporal_reasoning,
       key_terms, first_detected, peak_at, layer_coverage, layer_analysis,
       corroboration_score, missing_evidence, recommended_actions, model_used,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  const insertEv = db.prepare(`
    INSERT OR REPLACE INTO unified_signal_evidence (unified_signal_id, evidence_id, layer, relevance)
    VALUES (?, ?, ?, ?)
  `);

  let saved = 0;
  const tx = db.transaction(() => {
    for (const s of synthesized) {
      const sid = `unified:${context}:${day}:${slug(s.topic.name)}:${crypto.randomBytes(3).toString("hex")}`;
      const syn = s.synthesis || {};
      insertSig.run(
        sid,
        context,
        s.topic.name,
        s.topic.description || null,
        syn.thesis || null,
        syn.temporal_state || null,
        syn.temporal_reasoning || null,
        JSON.stringify(s.topic.key_terms || []),
        s.temporal?.first_detected || null,
        s.temporal?.peak_at || null,
        JSON.stringify(s.layerCoverage || {}),
        JSON.stringify(syn.layer_analysis || {}),
        typeof syn.corroboration_score === "number" ? syn.corroboration_score : null,
        JSON.stringify(syn.missing_evidence || []),
        JSON.stringify(syn.recommended_actions || []),
        s.modelUsed || null,
      );
      // Link top-weighted evidence per layer (cap 5 each)
      for (const [layer, packets] of Object.entries(s.layers || {})) {
        for (const p of (packets || []).slice(0, 5)) {
          try { insertEv.run(sid, p.id, layer, p.evidence_weight || 1); } catch {}
        }
      }
      saved++;
    }
  });
  tx();

  // Write the markdown briefing
  const outDir = path.resolve("output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, `unified-${context}-${day}.md`);
  const md = renderMarkdown({ ctxLabel: ctxRow.label, asOf: day, synthesized });
  fs.writeFileSync(mdPath, md);

  return { savedCount: saved, mdPath };
}
