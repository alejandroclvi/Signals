/**
 * Ingest orchestrator — runs the full pipeline through 4 stages:
 *   collect → classify → extract → validate
 *
 * Each stage has a quality gate. Pipeline run metadata is stored
 * for observability. Same external signature as before.
 *
 * Can be called from the API or CLI.
 */

import { getDb } from "../db/connection.mjs";
import { collect } from "./stages/collect.mjs";
import { classify } from "./stages/classify.mjs";
import { extract } from "./stages/extract.mjs";
import { validate } from "./stages/validate.mjs";
import { createUnits } from "./intelligence-chain.mjs";
import crypto from "node:crypto";

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Run a Reddit ingestion for a given context.
 *
 * Options:
 *   contextId - which context to ingest into
 *   subreddits - override subreddits (defaults to context config)
 *   queries - override queries (defaults to context config)
 *   limitPerQuery - max results per query (default 12)
 *   sort - Reddit sort order (default "new")
 *   onProgress - callback for progress updates
 *
 * Returns { evidenceCount, signalCount, errors, runId }
 */
export async function ingestReddit(options) {
  const db = getDb();
  const { contextId, onProgress } = options;
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  // Load context config
  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(contextId);
  if (!context) throw new Error("Context not found: " + contextId);

  const subreddits = options.subreddits || safeParseJson(context.subreddits, []);
  const queries = options.queries || safeParseJson(context.queries, []);

  if (!queries.length) {
    throw new Error("Context has no queries configured");
  }

  // Discovery mode: empty subreddits = search all of Reddit
  // The fetcher handles null subreddits by using Reddit's global search
  const cleanSubs = subreddits.length > 0
    ? subreddits.map(s => s.replace(/^r\//, ""))
    : [];

  // Resume support: load existing evidence IDs
  const existingIds = new Set(
    db.prepare("SELECT id FROM evidence_packets WHERE context_id = ?")
      .all(contextId).map(r => r.id)
  );
  const existingSourceItems = new Set(
    db.prepare("SELECT source_item_id FROM evidence_packets WHERE context_id = ?")
      .all(contextId).map(r => r.source_item_id)
  );

  const stageResults = {};
  const qualityGates = {};
  let allErrors = [];

  // --- Stage 1: Collection ---
  const collected = await collect({
    contextId, subreddits: cleanSubs, queries,
    limitPerQuery: options.limitPerQuery, sort: options.sort,
    existingIds, existingSourceItems, onProgress,
  });
  stageResults.collection = collected.stats;
  qualityGates.collection = collected.gate;
  allErrors = allErrors.concat(collected.errors || []);

  if (!collected.output.evidencePackets.length) {
    finishRun(db, runId, contextId, startedAt, stageResults, qualityGates, 0, 0, 0, "completed");
    if (onProgress) onProgress({ stage: "done", message: "No new evidence to ingest." });
    return { evidenceCount: 0, signalCount: 0, errors: allErrors, runId };
  }

  // --- Stage 2: Classification ---
  const classified = classify({
    evidencePackets: collected.output.evidencePackets,
    onProgress,
  });
  stageResults.classification = classified.stats;
  qualityGates.classification = classified.gate;

  const evidencePackets = classified.output.evidencePackets;

  // --- Write evidence to SQLite ---
  if (onProgress) onProgress({ stage: "store", message: "Storing " + evidencePackets.length + " evidence packets..." });

  const insertEvidence = db.prepare(
    `INSERT OR IGNORE INTO evidence_packets
     (id, context_id, source_id, source_layer, source_item_id, url, title, body,
      author_ref, community, observed_at, published_at, metrics, topics, raw_ref, content_hash,
      intent, awareness_level, sentiment, evidence_state, evidence_weight, quality_score, pipeline_run_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const writeEvidence = db.transaction(() => {
    for (const ep of evidencePackets) {
      insertEvidence.run(
        ep.id, ep.context_id, ep.source_id, ep.source_layer, ep.source_item_id,
        ep.url, ep.title, ep.body, ep.author_ref, ep.community,
        ep.observed_at, ep.published_at, ep.metrics, ep.topics, ep.raw_ref, ep.content_hash,
        ep.intent || "question", ep.awareness_level || "problem_aware", ep.sentiment || "neutral",
        ep.evidence_state || "sharing_insight",
        ep.evidence_weight || 1.0, ep.quality_score || null, runId
      );
    }
  });
  writeEvidence();

  // --- Intelligence chain: create L0 observations for high-signal evidence ---
  try {
    const obsUnits = evidencePackets
      .filter(ep => {
        const m = safeParseJson(ep.metrics, {});
        return (ep.evidence_weight || 1) >= 1.5 || (m.score || 0) >= 10;
      })
      .map(ep => {
        const m = safeParseJson(ep.metrics, {});
        const body = (ep.body || ep.title || "").slice(0, 120);
        return {
          unitType: "observation",
          claim: body + (body.length >= 120 ? "\u2026" : ""),
          detail: ep.title,
          sourceType: "evidence_packet",
          sourceId: ep.id,
          method: "ingestion",
          parentIds: [],
          contextId,
          community: ep.community,
          confidence: 0.3 + Math.min(0.4, (m.score || 0) / 100),
          confidenceBasis: (m.score || 0) + " upvotes",
          createdBy: "ingest",
        };
      });
    if (obsUnits.length > 0) createUnits(obsUnits);
  } catch (e) { /* chain is non-blocking */ }

  // --- Stage 3: Extraction (from ALL evidence in context, cumulative) ---
  const allEvidence = db.prepare(
    "SELECT * FROM evidence_packets WHERE context_id = ?"
  ).all(contextId).map(row => ({
    ...row,
    metrics: row.metrics,
    topics: row.topics,
  }));

  if (onProgress) onProgress({ stage: "extract", message: "Extracting signals from " + allEvidence.length + " total packets..." });

  const extracted = extract({
    allEvidence, contextId, onProgress,
  });
  stageResults.extraction = extracted.stats;
  qualityGates.extraction = extracted.gate;

  // --- Stage 4: Validation ---
  const validated = validate({
    signals: extracted.output.signals,
    signalEvidence: extracted.output.signalEvidence,
    allEvidence, onProgress,
  });
  stageResults.validation = validated.stats;
  qualityGates.validation = validated.gate;

  const signals = validated.output.signals;
  const signalEvidence = validated.output.signalEvidence;

  // --- Write signals to SQLite ---
  if (onProgress) onProgress({ stage: "store", message: "Storing " + signals.length + " signals..." });

  const writeSignals = db.transaction(() => {
    // Clear previous live signals and their extractions for this context
    const oldSignals = db.prepare("SELECT id FROM signals WHERE context_id = ? AND id LIKE 'live:%'").all(contextId);
    for (const old of oldSignals) {
      db.prepare("DELETE FROM signal_related WHERE signal_id = ?").run(old.id);
      db.prepare("DELETE FROM signal_spread WHERE signal_id = ?").run(old.id);
      db.prepare("DELETE FROM signal_phrases WHERE signal_id = ?").run(old.id);
      db.prepare("DELETE FROM signal_evidence WHERE signal_id = ?").run(old.id);
      db.prepare("DELETE FROM scoring_runs WHERE signal_id = ?").run(old.id);
    }
    db.prepare("DELETE FROM signals WHERE context_id = ? AND id LIKE 'live:%'").run(contextId);
    db.prepare(
      `DELETE FROM evidence_extractions WHERE evidence_id IN
       (SELECT id FROM evidence_packets WHERE context_id = ?)`
    ).run(contextId);

    const insertSignal = db.prepare(
      `INSERT OR REPLACE INTO signals
       (id, context_id, rank, status, title, growth, tags, summary, communities,
        mentions, comments, confidence, volume, why, suggested_title, suggested_sub,
        next_source, dominant_intent, intent_mix, awareness_distribution, dominant_awareness,
        desire_type, top_extractions, failed_solutions,
        bubble_x, bubble_y, bubble_r)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertSE = db.prepare("INSERT OR REPLACE INTO signal_evidence (signal_id, evidence_id) VALUES (?, ?)");
    const insertPhrase = db.prepare("INSERT INTO signal_phrases (signal_id, phrase, count) VALUES (?, ?, ?)");
    const insertSpread = db.prepare("INSERT INTO signal_spread (signal_id, community, percentage) VALUES (?, ?, ?)");
    const insertScoringRun = db.prepare(
      "INSERT INTO scoring_runs (id, signal_id, components, total) VALUES (?, ?, ?, ?)"
    );
    const insertExtraction = db.prepare(
      `INSERT OR IGNORE INTO evidence_extractions
       (id, evidence_id, extraction_type, surface_text, deeper_text, confidence, upvotes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const signal of signals) {
      insertSignal.run(
        signal.id, signal.context_id, signal.rank, signal.status,
        signal.title, signal.growth, signal.tags, signal.summary,
        signal.communities, signal.mentions, signal.comments,
        signal.confidence, signal.volume, signal.why,
        signal.suggested_title, signal.suggested_sub, signal.next_source,
        signal.dominant_intent || "question", signal.intent_mix || "{}",
        signal.awareness_distribution || "{}", signal.dominant_awareness || "problem_aware",
        signal.desire_type || null, signal.top_extractions || "[]", signal.failed_solutions || "[]",
        signal.bubble_x, signal.bubble_y, signal.bubble_r
      );

      // Evidence links
      const packetIds = signalEvidence.get(signal.id) || [];
      for (const eid of packetIds) {
        insertSE.run(signal.id, eid);
      }

      // Phrases
      if (signal._phrases) {
        for (const [phrase, count] of signal._phrases) {
          insertPhrase.run(signal.id, phrase, count);
        }
      }

      // Spread
      if (signal._spread) {
        for (const [community, pct] of signal._spread) {
          insertSpread.run(signal.id, community, pct);
        }
      }

      // Scoring run
      if (signal._scoreComponents) {
        insertScoringRun.run(
          crypto.randomUUID(),
          signal.id,
          JSON.stringify(signal._scoreComponents),
          signal._scoreTotal
        );
      }

      // Deep extractions
      if (signal._deepExtractions && signal._deepExtractions.length) {
        for (const ext of signal._deepExtractions) {
          insertExtraction.run(
            ext.id, ext.evidence_id, ext.extraction_type,
            ext.surface_text, ext.deeper_text, ext.confidence, ext.upvotes
          );
        }
      }
    }
  });
  writeSignals();

  // --- Timeline snapshot ---
  const today = new Date().toISOString().slice(0, 10);
  const totalPosts = db.prepare(
    "SELECT COUNT(*) as c FROM evidence_packets WHERE context_id = ? AND (source_item_id IS NULL OR source_item_id NOT LIKE 't1_%')"
  ).get(contextId).c;
  const totalComments = db.prepare(
    "SELECT COUNT(*) as c FROM evidence_packets WHERE context_id = ? AND source_item_id LIKE 't1_%'"
  ).get(contextId).c;
  const totalAuthors = db.prepare(
    "SELECT COUNT(DISTINCT author_ref) as c FROM evidence_packets WHERE context_id = ? AND author_ref IS NOT NULL"
  ).get(contextId).c;

  db.prepare(
    `INSERT OR REPLACE INTO timeline_snapshots (context_id, snapshot_date, posts, comments, authors)
     VALUES (?, ?, ?, ?, ?)`
  ).run(contextId, today, totalPosts, totalComments, totalAuthors);

  // --- Store pipeline run ---
  finishRun(db, runId, contextId, startedAt, stageResults, qualityGates,
    evidencePackets.length, evidencePackets.length, signals.length, "completed");

  if (onProgress) {
    const gatesSummary = Object.entries(qualityGates)
      .map(([k, v]) => k + ": " + (v.passed ? "pass" : "FAIL"))
      .join(", ");
    onProgress({
      stage: "done",
      message: "Done. " + evidencePackets.length + " new packets, " + signals.length + " signals. Gates: " + gatesSummary,
    });
  }

  return {
    evidenceCount: evidencePackets.length,
    signalCount: signals.length,
    errors: allErrors,
    runId,
  };
}

function finishRun(db, runId, contextId, startedAt, stageResults, qualityGates, evidenceIn, evidenceOut, signalsProduced, status) {
  db.prepare(
    `INSERT OR REPLACE INTO pipeline_runs
     (id, context_id, started_at, completed_at, stage_results, quality_gates, evidence_in, evidence_out, signals_produced, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    runId, contextId, startedAt, new Date().toISOString(),
    JSON.stringify(stageResults), JSON.stringify(qualityGates),
    evidenceIn, evidenceOut, signalsProduced, status
  );
}
