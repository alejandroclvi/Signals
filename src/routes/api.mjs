import { Router } from "express";
import { getDb } from "../db/connection.mjs";
import { ingestReddit } from "../pipeline/ingest.mjs";
import { reconstructThreads, qualifyThreads, storeThreads } from "../pipeline/thread-reconstructor.mjs";
import { analyzeThreadBatch, storeThreadIntelligence } from "../pipeline/thread-intelligence.mjs";
import { reconcileThread } from "../pipeline/thread-reconciler.mjs";
import { refreshSignals } from "../pipeline/refresh-signals.mjs";
import { createUnit, getSignalChain, getChain, getContextChain } from "../pipeline/intelligence-chain.mjs";
import { regenerateThread } from "../pipeline/thread-regen.mjs";
import { broadcast } from "./sse.mjs";

const router = Router();

function safeJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}


router.get("/api/contexts", (req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM contexts ORDER BY label").all();
  res.json(rows);
});

router.get("/api/contexts/:id/radar", (req, res) => {
  const data = buildRadarData(req.params.id);
  if (!data) return res.status(404).json({ error: "Context not found" });
  res.json(data);
});

router.get("/api/fixtures/:id/load", (req, res) => {
  const data = buildFixtureData(req.params.id);
  if (!data) return res.status(404).json({ error: "Fixture not found" });
  res.json(data);
});

router.get("/api/signals/:id", (req, res) => {
  const db = getDb();
  const signal = db.prepare("SELECT * FROM signals WHERE id = ?").get(req.params.id);
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  const evidence = db.prepare(
    `SELECT ep.* FROM evidence_packets ep
     JOIN signal_evidence se ON se.evidence_id = ep.id
     WHERE se.signal_id = ?`
  ).all(req.params.id);

  const phrases = db.prepare("SELECT phrase, count FROM signal_phrases WHERE signal_id = ?").all(req.params.id);
  const spread = db.prepare("SELECT community, percentage FROM signal_spread WHERE signal_id = ?").all(req.params.id);
  const related = db.prepare("SELECT label, tag, score FROM signal_related WHERE signal_id = ?").all(req.params.id);

  // Evidence layer coverage
  const allLayers = db.prepare("SELECT id, label FROM evidence_layers ORDER BY sort_order").all();
  const coveredLayerIds = new Set(evidence.map(e => e.source_layer).filter(Boolean));
  const layerCoverage = allLayers.map(l => ({
    id: l.id,
    label: l.label,
    covered: coveredLayerIds.has(l.id),
  }));

  res.json({
    ...signal,
    tags: safeJson(signal.tags, []),
    communities: safeJson(signal.communities, []),
    dominant_intent: signal.dominant_intent || "question",
    intent_mix: safeJson(signal.intent_mix, {}),
    awareness_distribution: safeJson(signal.awareness_distribution, {}),
    dominant_awareness: signal.dominant_awareness || null,
    desire_type: signal.desire_type || null,
    top_extractions: safeJson(signal.top_extractions, []),
    failed_solutions: safeJson(signal.failed_solutions, []),
    evidence: evidence.map(formatEvidencePacket),
    phrases: phrases.map(p => [p.phrase, p.count]),
    spread: spread.map(s => [s.community, s.percentage]),
    related: related.map(r => [r.label, r.tag, r.score]),
    layerCoverage,
  });
});

// --- Mutations ---

router.post("/api/source-nodes/:id/toggle", (req, res) => {
  const db = getDb();
  const node = db.prepare("SELECT * FROM source_nodes WHERE id = ?").get(req.params.id);
  if (!node) return res.status(404).json({ error: "Source node not found" });
  if (node.state === "gated") return res.status(400).json({ error: "Cannot toggle a gated node" });

  const newState = node.state === "enabled" ? "available" : "enabled";
  db.prepare("UPDATE source_nodes SET state = ? WHERE id = ?").run(newState, req.params.id);
  res.json({ id: req.params.id, state: newState });
});

router.post("/api/signals/:id/save", (req, res) => {
  const db = getDb();
  const signal = db.prepare("SELECT id, saved, title, context_id FROM signals WHERE id = ?").get(req.params.id);
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  const newValue = signal.saved ? 0 : 1;
  db.prepare("UPDATE signals SET saved = ?, updated_at = datetime('now') WHERE id = ?").run(newValue, req.params.id);

  if (newValue) {
    try { createUnit({ unitType: "conclusion", claim: "Signal confirmed: " + signal.title, sourceType: "human", sourceId: signal.id, method: "human", parentIds: [], signalId: signal.id, contextId: signal.context_id, confidence: 0.95, confidenceBasis: "human confirmation", createdBy: "human" }); } catch {}
  }

  res.json({ id: req.params.id, saved: newValue });
});

router.post("/api/signals/:id/dismiss", (req, res) => {
  const db = getDb();
  const signal = db.prepare("SELECT id, dismissed, title, context_id FROM signals WHERE id = ?").get(req.params.id);
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  const newValue = signal.dismissed ? 0 : 1;
  db.prepare("UPDATE signals SET dismissed = ?, updated_at = datetime('now') WHERE id = ?").run(newValue, req.params.id);

  if (newValue) {
    try { createUnit({ unitType: "conclusion", claim: "Signal dismissed: " + signal.title, sourceType: "human", sourceId: signal.id, method: "human", parentIds: [], signalId: signal.id, contextId: signal.context_id, confidence: 0.1, confidenceBasis: "human dismissal", createdBy: "human" }); } catch {}
  }

  res.json({ id: req.params.id, dismissed: newValue });
});

router.post("/api/signals/:id/alert", (req, res) => {
  const db = getDb();
  const signal = db.prepare("SELECT id, alerted FROM signals WHERE id = ?").get(req.params.id);
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  const newValue = signal.alerted ? 0 : 1;
  db.prepare("UPDATE signals SET alerted = ?, updated_at = datetime('now') WHERE id = ?").run(newValue, req.params.id);
  res.json({ id: req.params.id, alerted: newValue });
});

router.post("/api/contexts", (req, res) => {
  const db = getDb();
  const { label, description, subreddits, queries, high_intent } = req.body;
  if (!label) return res.status(400).json({ error: "Label is required" });

  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const existing = db.prepare("SELECT id FROM contexts WHERE id = ?").get(id);
  if (existing) return res.status(409).json({ error: "Context already exists" });

  db.prepare(
    "INSERT INTO contexts (id, label, description, subreddits, queries, high_intent) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    label,
    description || "",
    JSON.stringify(subreddits || []),
    JSON.stringify(queries || []),
    JSON.stringify(high_intent || [])
  );

  // Seed default source nodes for the new context
  const defaultNodes = [
    { id: "reddit", name: "Reddit", state: "enabled", layers: ["conversation"], lift: 0, adds: "Pain language and repeated complaints.", cannot: "Cannot prove buying intent, budget, or adoption." },
    { id: "google-search", name: "Google Search", state: "available", layers: ["intent"], lift: 11, adds: "Active discovery and comparison intent.", cannot: "Cannot prove purchase or retention." },
    { id: "hacker-news", name: "Hacker News", state: "available", layers: ["conversation"], lift: 7, adds: "Builder debate and technical skepticism.", cannot: "Narrow audience, not broad demand." },
    { id: "github", name: "GitHub", state: "available", layers: ["behavior"], lift: 9, adds: "Implementation artifacts and developer adoption.", cannot: "Cannot prove buyer budget." },
    { id: "primary", name: "Primary Sources", state: "available", layers: ["truth"], lift: 10, adds: "Official confirmation, filings, docs, vendor claims.", cannot: "Often validates later than social discovery." },
  ];

  const insertNode = db.prepare(
    "INSERT OR REPLACE INTO source_nodes (id, context_id, name, state, layers, lift, adds, cannot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const n of defaultNodes) {
    insertNode.run(n.id + ":" + id, id, n.name, n.state, JSON.stringify(n.layers), n.lift, n.adds, n.cannot);
  }

  res.status(201).json({ id, label });
});

router.post("/api/contexts/from-topic", async (req, res) => {
  const { topic, description } = req.body;
  if (!topic) return res.status(400).json({ error: "Topic is required" });

  broadcast("toast", { message: "Generating research context for: " + topic + "...", type: "info" });

  try {
    const { generateContextFromBrief } = await import("../agents/research-brief.mjs");
    const result = await generateContextFromBrief(topic, { description });
    const ctx = result.context;

    const db = getDb();
    const existing = db.prepare("SELECT id FROM contexts WHERE id = ?").get(ctx.id);
    if (existing) {
      // Update instead of fail
      db.prepare(`
        UPDATE contexts SET label = ?, description = ?, thesis = ?, avatar = ?, queries = ?, high_intent = ?, research_passes = ?, grouping_mode = ?
        WHERE id = ?
      `).run(ctx.label, ctx.description, ctx.thesis, ctx.avatar, JSON.stringify(ctx.queries), JSON.stringify(ctx.high_intent), JSON.stringify(ctx.research_passes), "theme", ctx.id);
    } else {
      db.prepare(`
        INSERT INTO contexts (id, label, description, thesis, avatar, queries, high_intent, research_passes, grouping_mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ctx.id, ctx.label, ctx.description, ctx.thesis, ctx.avatar, JSON.stringify(ctx.queries), JSON.stringify(ctx.high_intent), JSON.stringify(ctx.research_passes), "theme");

      // Seed default source nodes
      const defaultNodes = [
        { id: "reddit", name: "Reddit", state: "enabled", layers: ["conversation"], lift: 0, adds: "Pain language and repeated complaints.", cannot: "Cannot prove buying intent, budget, or adoption." },
        { id: "google-search", name: "Google Search", state: "available", layers: ["intent"], lift: 11, adds: "Active discovery and comparison intent.", cannot: "Cannot prove purchase or retention." },
        { id: "hacker-news", name: "Hacker News", state: "available", layers: ["conversation"], lift: 7, adds: "Builder debate and technical skepticism.", cannot: "Narrow audience, not broad demand." },
        { id: "github", name: "GitHub", state: "available", layers: ["behavior"], lift: 9, adds: "Implementation artifacts and developer adoption.", cannot: "Cannot prove buyer budget." },
        { id: "primary", name: "Primary Sources", state: "available", layers: ["truth"], lift: 10, adds: "Official confirmation, filings, docs, vendor claims.", cannot: "Often validates later than social discovery." },
      ];
      const insertNode = db.prepare(
        "INSERT OR REPLACE INTO source_nodes (id, context_id, name, state, layers, lift, adds, cannot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      );
      for (const n of defaultNodes) {
        insertNode.run(n.id + ":" + ctx.id, ctx.id, n.name, n.state, JSON.stringify(n.layers), n.lift, n.adds, n.cannot);
      }
    }

    // Generate theme labels
    try {
      const { generateThemeLabels } = await import("../pipeline/theme-labeler.mjs");
      await generateThemeLabels(ctx.id);
    } catch {}

    broadcast("toast", { message: "Context ready: " + ctx.label + " (" + ctx.queries.length + " queries). Open it and run Chrome discovery.", type: "info" });

    // Push the brief as a report modal
    broadcast("report", { title: "Research Brief: " + ctx.label, body: result.brief, format: "markdown" });

    res.status(201).json({ id: ctx.id, label: ctx.label, queryCount: ctx.queries.length, briefId: result.briefId });
  } catch (err) {
    broadcast("toast", { message: "Context generation failed: " + err.message, type: "error" });
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/contexts/:id", (req, res) => {
  const db = getDb();
  const ctx = db.prepare("SELECT id FROM contexts WHERE id = ?").get(req.params.id);
  if (!ctx) return res.status(404).json({ error: "Context not found" });

  db.transaction(() => {
    // Get signal IDs for this context to clean up join tables
    const signalIds = db.prepare("SELECT id FROM signals WHERE context_id = ?").all(req.params.id).map(r => r.id);
    for (const sid of signalIds) {
      db.prepare("DELETE FROM signal_related WHERE signal_id = ?").run(sid);
      db.prepare("DELETE FROM signal_spread WHERE signal_id = ?").run(sid);
      db.prepare("DELETE FROM signal_phrases WHERE signal_id = ?").run(sid);
      db.prepare("DELETE FROM signal_evidence WHERE signal_id = ?").run(sid);
    }
    db.prepare("DELETE FROM signals WHERE context_id = ?").run(req.params.id);
    db.prepare("DELETE FROM evidence_packets WHERE context_id = ?").run(req.params.id);
    db.prepare("DELETE FROM source_nodes WHERE context_id = ?").run(req.params.id);
    db.prepare("DELETE FROM fixture_meta WHERE context_id = ?").run(req.params.id);
    db.prepare("DELETE FROM timeline_snapshots WHERE context_id = ?").run(req.params.id);
    db.prepare("DELETE FROM contexts WHERE id = ?").run(req.params.id);
  })();

  res.json({ deleted: req.params.id });
});

// --- Ingestion ---

let ingestionRunning = false;

router.post("/api/ingest/reddit", async (req, res) => {
  if (ingestionRunning) {
    return res.status(409).json({ error: "Ingestion already running" });
  }

  const contextId = req.body.context_id || req.query.context;
  if (!contextId) return res.status(400).json({ error: "context_id is required" });

  const db = getDb();
  const context = db.prepare("SELECT id FROM contexts WHERE id = ?").get(contextId);
  if (!context) return res.status(404).json({ error: "Context not found" });

  ingestionRunning = true;
  const TIMEOUT_MS = 120_000;
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Ingestion timed out after " + (TIMEOUT_MS / 1000) + "s")), TIMEOUT_MS)
    );
    const result = await Promise.race([
      ingestReddit({
        contextId,
        limitPerQuery: req.body.limitPerQuery || 12,
        sort: req.body.sort || "new",
        afterDate: req.body.afterDate,
        beforeDate: req.body.beforeDate,
        onProgress: (info) => {
          console.log("[ingest]", info.stage, info.message || (info.subreddit + "/" + info.query + ": " + info.count));
        },
      }),
      timeout,
    ]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    ingestionRunning = false;
  }
});

// --- Queries ---

router.get("/api/evidence", (req, res) => {
  const db = getDb();
  const contextId = req.query.context;
  const source = req.query.source;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;

  let where = "WHERE 1=1";
  const filterParams = [];

  if (contextId) {
    where += " AND ep.context_id = ?";
    filterParams.push(contextId);
  }
  if (source) {
    where += " AND ep.source_id = ?";
    filterParams.push(source);
  }

  const rows = db.prepare(
    "SELECT ep.*, se.signal_id FROM evidence_packets ep LEFT JOIN signal_evidence se ON se.evidence_id = ep.id " +
    where + " ORDER BY ep.published_at DESC LIMIT ? OFFSET ?"
  ).all(...filterParams, limit, offset);

  const total = db.prepare(
    "SELECT COUNT(*) as count FROM evidence_packets ep " + where
  ).get(...filterParams);

  res.json({
    evidence: rows.map(row => ({
      ...formatEvidencePacket(row),
      signal_id: row.signal_id,
      context_id: row.context_id,
      source_id: row.source_id,
      source_layer: row.source_layer,
      community: row.community,
      published_at: row.published_at,
    })),
    total: total.count,
    limit,
    offset,
  });
});

router.get("/api/pipeline-runs", (req, res) => {
  const db = getDb();
  const contextId = req.query.context;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  let rows;
  if (contextId) {
    rows = db.prepare(
      "SELECT * FROM pipeline_runs WHERE context_id = ? ORDER BY started_at DESC LIMIT ?"
    ).all(contextId, limit);
  } else {
    rows = db.prepare(
      "SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ?"
    ).all(limit);
  }

  res.json(rows.map(row => ({
    ...row,
    stage_results: safeJson(row.stage_results, {}),
    quality_gates: safeJson(row.quality_gates, {}),
  })));
});

router.get("/api/stats", (req, res) => {
  const db = getDb();
  const contextId = req.query.context;

  let signalCount, savedCount, evidenceCount, communityCount;

  if (contextId) {
    signalCount = db.prepare("SELECT COUNT(*) as c FROM signals WHERE context_id = ? AND dismissed = 0").get(contextId).c;
    savedCount = db.prepare("SELECT COUNT(*) as c FROM signals WHERE context_id = ? AND saved = 1").get(contextId).c;
    evidenceCount = db.prepare("SELECT COUNT(*) as c FROM evidence_packets WHERE context_id = ?").get(contextId).c;
    communityCount = db.prepare("SELECT COUNT(DISTINCT community) as c FROM evidence_packets WHERE context_id = ?").get(contextId).c;
  } else {
    signalCount = db.prepare("SELECT COUNT(*) as c FROM signals WHERE dismissed = 0").get().c;
    savedCount = db.prepare("SELECT COUNT(*) as c FROM signals WHERE saved = 1").get().c;
    evidenceCount = db.prepare("SELECT COUNT(*) as c FROM evidence_packets").get().c;
    communityCount = db.prepare("SELECT COUNT(DISTINCT community) as c FROM evidence_packets").get().c;
  }

  res.json({ signals: signalCount, saved: savedCount, evidence: evidenceCount, communities: communityCount });
});

export function buildRadarData(contextId, fixtureId) {
  const db = getDb();

  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(contextId);
  if (!context) return null;

  // Get fixture meta for this context
  const fixtureMeta = fixtureId
    ? db.prepare("SELECT * FROM fixture_meta WHERE id = ?").get(fixtureId)
    : db.prepare("SELECT * FROM fixture_meta WHERE context_id = ? LIMIT 1").get(contextId);

  // Get all fixtures for the fixture selector
  const allFixtures = db.prepare("SELECT id, label FROM fixture_meta ORDER BY label").all();

  // Get signals
  const rawSignals = db.prepare(
    "SELECT * FROM signals WHERE context_id = ? ORDER BY rank"
  ).all(contextId);

  const signals = rawSignals.map(formatSignal);

  // Get source nodes
  const sourceNodes = db.prepare(
    "SELECT * FROM source_nodes WHERE context_id = ? ORDER BY name"
  ).all(contextId).map(n => ({
    ...n,
    layers: safeJson(n.layers, []),
  }));

  // Get evidence layers
  const evidenceLayers = db.prepare(
    "SELECT id, label, note FROM evidence_layers ORDER BY sort_order"
  ).all();

  // Compute live dashboard data when no fixture metadata exists
  let liveTimeline = { posts: [], comments: [], authors: [] };
  let liveHeatmap = [];
  let liveMetrics = [];
  let liveIntent = [];

  if (!fixtureMeta) {
    // Timeline: group evidence by date, count posts/comments/authors per day
    const timelineRows = db.prepare(
      `SELECT date(published_at) as d,
              SUM(CASE WHEN source_item_id LIKE 't3_%' OR source_item_id NOT LIKE 't1_%' THEN 1 ELSE 0 END) as posts,
              SUM(CASE WHEN source_item_id LIKE 't1_%' THEN 1 ELSE 0 END) as comments,
              COUNT(DISTINCT author_ref) as authors
       FROM evidence_packets
       WHERE context_id = ? AND published_at IS NOT NULL
       GROUP BY d ORDER BY d`
    ).all(contextId);
    if (timelineRows.length) {
      liveTimeline = {
        posts: timelineRows.map(r => r.posts),
        comments: timelineRows.map(r => r.comments),
        authors: timelineRows.map(r => r.authors),
      };
    }

    // Heatmap: top 5 communities × top 4 signals
    const topComms = db.prepare(
      `SELECT community, COUNT(*) as c FROM evidence_packets
       WHERE context_id = ? AND community IS NOT NULL AND community != ''
       GROUP BY community ORDER BY c DESC LIMIT 5`
    ).all(contextId);
    const topSignalIds = signals.slice(0, 4).map(s => s.id);
    liveHeatmap = topComms.map(row => {
      const counts = topSignalIds.map(sid => {
        return db.prepare(
          `SELECT COUNT(*) as c FROM evidence_packets ep
           JOIN signal_evidence se ON se.evidence_id = ep.id
           WHERE se.signal_id = ? AND ep.community = ?`
        ).get(sid, row.community).c;
      });
      return [row.community, counts];
    });

    // Metrics: computed from evidence and signals
    const evidenceCount = db.prepare("SELECT COUNT(*) as c FROM evidence_packets WHERE context_id = ?").get(contextId).c;
    const savedCount = db.prepare("SELECT COUNT(*) as c FROM signals WHERE context_id = ? AND saved = 1").get(contextId).c;
    const communityCount = db.prepare("SELECT COUNT(DISTINCT community) as c FROM evidence_packets WHERE context_id = ?").get(contextId).c;

    // Spark arrays from timeline_snapshots history
    const snapshots = db.prepare(
      "SELECT posts, comments, authors FROM timeline_snapshots WHERE context_id = ? ORDER BY snapshot_date DESC LIMIT 7"
    ).all(contextId).reverse();
    const evidenceSpark = snapshots.length >= 2 ? snapshots.map(s => s.posts + s.comments) : [0, evidenceCount];

    liveMetrics = [
      { title: "Emerging signals", value: String(signals.length), delta: "+live", caption: "detected this period", spark: [0, signals.length] },
      { title: "High-confidence", value: String(signals.filter(s => s.confidence === "High").length), delta: "-", caption: "evidence >= 3 sources", spark: [0, signals.filter(s => s.confidence === "High").length] },
      { title: "Communities monitored", value: String(communityCount), delta: "-", caption: "in active context", spark: [0, communityCount] },
      { title: "Saved evidence", value: String(evidenceCount), delta: "+live", caption: "packets ingested", spark: evidenceSpark },
    ];

    // Intent: group evidence by intent classification
    const intentRows = db.prepare(
      `SELECT intent, COUNT(*) as c FROM evidence_packets
       WHERE context_id = ? AND intent IS NOT NULL AND intent != ''
       GROUP BY intent ORDER BY c DESC`
    ).all(contextId);
    const intentColors = { pain: "#de5c56", question: "#2d6fbb", comparison: "#bd842f", promotion: "#875fb4", insight: "#3e9558" };
    liveIntent = intentRows.map(r => [r.intent, r.c, intentColors[r.intent] || "#9aa3ad"]);
  }

  // Pipeline health — last run for this context
  const lastRun = db.prepare(
    "SELECT * FROM pipeline_runs WHERE context_id = ? ORDER BY started_at DESC LIMIT 1"
  ).get(contextId);
  const pipelineHealth = lastRun ? {
    runId: lastRun.id,
    status: lastRun.status,
    startedAt: lastRun.started_at,
    completedAt: lastRun.completed_at,
    evidenceIn: lastRun.evidence_in,
    evidenceOut: lastRun.evidence_out,
    signalsProduced: lastRun.signals_produced,
    gates: safeJson(lastRun.quality_gates, {}),
  } : null;

  return {
    contextId,
    pipelineHealth,
    contextBrief: {
      label: context.label,
      description: context.description || null,
      thesis: context.thesis || null,
      avatar: context.avatar || null,
      researchPasses: safeJson(context.research_passes, null),
    },
    crumbs: fixtureMeta ? fixtureMeta.crumbs : "Radar / " + context.label,
    period: fixtureMeta ? fixtureMeta.period : "last 30d",
    topicCount: fixtureMeta ? fixtureMeta.topic_count : signals.length,
    selectedId: fixtureMeta ? fixtureMeta.selected_id : (signals[0] && signals[0].id),
    activeFixtureId: fixtureMeta ? fixtureMeta.id : "default",
    signals,
    otherBubbles: fixtureMeta ? safeJson(fixtureMeta.other_bubbles, []) : [],
    metrics: fixtureMeta ? safeJson(fixtureMeta.metrics, []) : liveMetrics,
    timeline: fixtureMeta ? safeJson(fixtureMeta.timeline, {}) : liveTimeline,
    heatmap: fixtureMeta ? safeJson(fixtureMeta.heatmap, []) : liveHeatmap,
    intent: fixtureMeta ? safeJson(fixtureMeta.intent, []) : liveIntent,
    evidenceLayers,
    sourceNodes,
    fixtures: allFixtures,
  };
}

// --- Signal intelligence (trigger thread analysis from UI) ---

router.post("/api/signals/:id/analyze", async (req, res) => {
  const db = getDb();
  const signal = db.prepare("SELECT * FROM signals WHERE id = ?").get(req.params.id);
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  broadcast("toast", { message: "Analyzing threads for " + signal.title + "...", type: "info" });

  try {
    // Get evidence packet IDs for this signal
    const evidenceIds = db.prepare(
      "SELECT evidence_id FROM signal_evidence WHERE signal_id = ?"
    ).all(signal.id).map(r => r.evidence_id);

    if (evidenceIds.length === 0) {
      return res.json({ analyzed: 0, message: "No evidence packets" });
    }

    // Reconstruct threads for this context, filter to this signal's threads
    let threads = reconstructThreads(signal.context_id);
    const evidenceSet = new Set(evidenceIds);
    threads = threads.filter(t => t.allPackets.some(p => evidenceSet.has(p.id)));
    storeThreads(threads);

    // Qualify and analyze
    const qualified = qualifyThreads(threads, { minWeightedEvidence: 2.0, minComments: 1, minRelevance: 0.1 });

    if (qualified.length === 0) {
      broadcast("toast", { message: "No qualifying threads to analyze", type: "info" });
      return res.json({ analyzed: 0, message: "No qualifying threads" });
    }

    const { results, skipped, errors } = await analyzeThreadBatch(qualified, { maxConcurrency: 3 });

    for (const result of results) {
      storeThreadIntelligence(result, signal.context_id);
    }

    // Reconcile
    for (const result of results) {
      reconcileThread(result.threadId, signal.context_id);
    }

    // Refresh signals so scores update
    refreshSignals(signal.context_id);

    broadcast("toast", { message: results.length + " threads analyzed, " + skipped.length + " unchanged", type: "info" });
    broadcast("reload", { reason: "signal analyzed" });

    res.json({
      analyzed: results.length,
      skipped: skipped.length,
      errors: errors.length,
      threadCount: threads.length,
    });
  } catch (err) {
    broadcast("toast", { message: "Analysis failed: " + err.message, type: "error" });
    res.status(500).json({ error: err.message });
  }
});

// --- Google Chrome Discovery + Ingest ---

router.post("/api/contexts/:id/discover", async (req, res) => {
  const db = getDb();
  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(req.params.id);
  if (!context) return res.status(404).json({ error: "Context not found" });

  const targetState = req.body.state; // optional — if set, uses state-targeted queries
  let queries;

  if (targetState) {
    const stateQueryTemplates = {
      experiencing_pain: ["{t} frustrating nightmare waste of time", "{t} spent hours debugging impossible", "{t} driving me crazy broken again", "{t} can't maintain unmaintainable mess"],
      tried_failed: ["tried {t} didn't work regret", "used {t} made everything worse", "{t} failed production shipped broken", "paid for {t} waste of money"],
      seeking: ["alternative to {t} looking for", "best replacement for {t}", "what to use instead of {t}", "how to fix {t} problems"],
      found_what_works: ["{t} actually great love it", "{t} game changer our team", "what I love about {t}", "{t} done right works well"],
      warning: ["don't use {t} biggest mistake", "warning {t} will ruin your project", "avoid {t} learned hard way", "stop using {t} too late"],
      comparing: ["{t} vs alternatives comparison", "{t} compared to competitors", "switched from {t} experience", "{t} pros cons honest review"],
    };
    const templates = stateQueryTemplates[targetState] || [];
    const topic = context.label.split(/[-—:]/).map(s => s.trim()).filter(s => s.length > 2)[0] || context.label;
    queries = templates.map(t => t.replace(/\{t\}/g, topic));
  } else {
    queries = JSON.parse(context.queries || "[]");
  }

  if (queries.length === 0) return res.status(400).json({ error: "No queries" });

  broadcast("toast", { message: "Opening Chrome for discovery... solve CAPTCHA if shown", type: "info" });

  // Respond immediately — discovery runs async
  res.json({ status: "discovery_started", queries: queries.length });

  try {
    const { discoverRedditThreads } = await import("../pipeline/google-discover.mjs");

    const discovery = await discoverRedditThreads({
      queries,
      contextId: context.id,
      limit: 10,
      onProgress: (info) => {
        if (info.stage === "captcha") broadcast("toast", { message: "CAPTCHA — solve it in the Chrome window", type: "error" });
        else if (info.stage === "ready") broadcast("toast", { message: "Google ready, searching...", type: "info" });
        else if (info.stage === "result") broadcast("toast", { message: `[${info.index + 1}] ${info.message} (${info.communities?.join(", ") || ""})`, type: "info" });
      },
    });

    broadcast("toast", { message: `Discovered ${discovery.threads.length} threads. Ingesting...`, type: "info" });

    // Ingest the discovered threads (fetches from Reddit, classifies, extracts, scores)
    const { ingestDiscoveredThreads } = await import("../pipeline/ingest-discovered.mjs");
    const result = await ingestDiscoveredThreads(context.id, {
      onProgress: (info) => {
        if (info.fetched % 20 === 0) {
          broadcast("toast", { message: `Fetched ${info.fetched}/${info.total} threads (${info.packets} packets)`, type: "info" });
        }
      },
    });

    broadcast("toast", { message: `Done: ${discovery.threads.length} discovered, ${result.evidenceCount} ingested, ${result.signalCount} signals`, type: "info" });
    broadcast("reload", { reason: "discovery completed" });

  } catch (err) {
    broadcast("toast", { message: "Discovery error: " + err.message, type: "error" });
  }
});

// --- Deepen research for a specific evidence state ---

router.post("/api/contexts/:id/deepen", async (req, res) => {
  const db = getDb();
  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(req.params.id);
  if (!context) return res.status(404).json({ error: "Context not found" });

  const targetState = req.body.state;
  if (!targetState) return res.status(400).json({ error: "state required" });

  const stateQueryTemplates = {
    experiencing_pain: [
      "{topic} frustrating waste of time",
      "{topic} nightmare impossible to work with",
      "{topic} spent hours debugging can't figure out",
      "{topic} driving me crazy broken again",
    ],
    tried_failed: [
      "tried {topic} didn't work gave up",
      "used {topic} regret made everything worse",
      "{topic} failed in production shipped broken",
      "paid for {topic} complete waste of money",
    ],
    seeking: [
      "alternative to {topic} looking for",
      "best replacement for {topic} recommendations",
      "how to fix {topic} problems anyone solved this",
      "what do you use instead of {topic}",
    ],
    found_what_works: [
      "{topic} actually great when you learn it properly",
      "{topic} game changer for our team workflow",
      "love {topic} best thing about it",
      "{topic} done right here is what works",
    ],
    warning: [
      "don't use {topic} biggest mistake",
      "warning {topic} will ruin your project",
      "avoid {topic} learned the hard way",
      "stop using {topic} before it's too late",
    ],
    comparing: [
      "{topic} vs alternatives honest comparison",
      "{topic} compared to competitors which is better",
      "switched from {topic} to something else experience",
      "{topic} pros and cons real review",
    ],
  };

  const templates = stateQueryTemplates[targetState];
  if (!templates) return res.status(400).json({ error: "Unknown state: " + targetState });

  // Extract topic keyword from context label
  const topic = context.label.split(/[-—:]/).map(s => s.trim()).filter(s => s.length > 2)[0] || context.label;
  const queries = templates.map(t => t.replace(/\{topic\}/g, topic));

  // Get existing subreddits from evidence for targeted search
  const topCommunities = db.prepare(
    `SELECT community, COUNT(*) as c FROM evidence_packets WHERE context_id = ? AND community IS NOT NULL
     GROUP BY community ORDER BY c DESC LIMIT 5`
  ).all(context.id).map(r => r.community.replace("r/", ""));

  const stateLabels = {
    experiencing_pain: "pain", tried_failed: "failures", seeking: "demand",
    found_what_works: "successes", warning: "warnings", comparing: "comparisons",
  };

  broadcast("toast", { message: "Searching for more " + (stateLabels[targetState] || targetState) + "...", type: "info" });

  try {
    const result = await ingestReddit({
      contextId: context.id,
      subreddits: topCommunities,
      queries,
      limitPerQuery: 5,
      sort: "relevance",
      onProgress: () => {},
    });

    // Backfill evidence_state on new packets
    const { classifyEvidenceState } = await import("../pipeline/normalizer.mjs");
    const newPackets = db.prepare(
      "SELECT id, title, body FROM evidence_packets WHERE context_id = ? AND evidence_state IS NULL"
    ).all(context.id);
    const update = db.prepare("UPDATE evidence_packets SET evidence_state = ? WHERE id = ?");
    const backfill = db.transaction(() => {
      for (const p of newPackets) update.run(classifyEvidenceState(p.title, p.body), p.id);
    });
    backfill();

    // Refresh signals
    refreshSignals(context.id);

    const msg = result.evidenceCount + " new packets found for " + (stateLabels[targetState] || targetState);
    broadcast("toast", { message: msg, type: "info" });
    broadcast("reload", { reason: "deepened research" });

    res.json({ evidenceCount: result.evidenceCount, signalCount: result.signalCount, queries });
  } catch (err) {
    broadcast("toast", { message: "Deepen failed: " + err.message, type: "error" });
    res.status(500).json({ error: err.message });
  }
});

// --- Context-level thread intelligence (all qualifying threads) ---

router.post("/api/contexts/:id/thread-intel", async (req, res) => {
  const db = getDb();
  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(req.params.id);
  if (!context) return res.status(404).json({ error: "Context not found" });

  broadcast("toast", { message: "Running thread intelligence for " + context.label + "...", type: "info" });

  try {
    let threads = reconstructThreads(context.id);
    storeThreads(threads);
    const qualified = qualifyThreads(threads, { minWeightedEvidence: 2.0, minComments: 1, minRelevance: 0.2 });

    if (qualified.length === 0) {
      broadcast("toast", { message: "No qualifying threads", type: "info" });
      return res.json({ analyzed: 0, skipped: 0 });
    }

    const limit = Math.min(qualified.length, req.body.limit || 30);
    const batch = qualified.slice(0, limit);

    broadcast("toast", { message: "Analyzing " + batch.length + " threads...", type: "info" });

    const { results, skipped, errors } = await analyzeThreadBatch(batch, { maxConcurrency: 3 });

    for (const result of results) {
      storeThreadIntelligence(result, context.id);
      reconcileThread(result.threadId, context.id);
    }

    refreshSignals(context.id);

    broadcast("toast", { message: results.length + " threads analyzed, " + skipped.length + " unchanged", type: "info" });
    broadcast("reload", { reason: "thread intelligence completed" });

    res.json({ analyzed: results.length, skipped: skipped.length, errors: errors.length, total: qualified.length });
  } catch (err) {
    broadcast("toast", { message: "Thread intelligence failed: " + err.message, type: "error" });
    res.status(500).json({ error: err.message });
  }
});

// --- Context-level research brief ---

router.post("/api/contexts/:id/brief", async (req, res) => {
  const { generateBriefFromIntelligence } = await import("../agents/research-brief.mjs");
  const db = getDb();
  const context = db.prepare("SELECT * FROM contexts WHERE id = ?").get(req.params.id);
  if (!context) return res.status(404).json({ error: "Context not found" });

  broadcast("toast", { message: "Generating research brief for " + context.label + "...", type: "info" });

  try {
    const result = await generateBriefFromIntelligence(context.id);

    broadcast("report", {
      title: "Research Brief: " + context.label,
      body: result.content,
      format: "markdown",
      timestamp: new Date().toISOString(),
    });

    broadcast("toast", { message: "Research brief ready (" + result.evidenceCount + " packets analyzed)", type: "info" });

    res.json({ briefId: result.id, evidenceCount: result.evidenceCount, communityCount: result.communityCount });
  } catch (err) {
    broadcast("toast", { message: "Brief generation failed: " + err.message, type: "error" });
    res.status(500).json({ error: err.message });
  }
});

// --- Research director (adaptive research loop) ---

router.get("/api/contexts/:id/coverage", async (req, res) => {
  try {
    const { assessCoverage } = await import("../pipeline/research-director.mjs");
    const coverage = assessCoverage(req.params.id);
    res.json(coverage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/contexts/:id/adaptive-queries", async (req, res) => {
  try {
    const { generateAdaptiveQueries } = await import("../pipeline/research-director.mjs");
    broadcast("toast", { message: "Generating adaptive queries...", type: "info" });
    const result = await generateAdaptiveQueries(req.params.id);
    broadcast("toast", { message: result.reason, type: "info" });
    res.json(result);
  } catch (err) {
    broadcast("toast", { message: "Adaptive query generation failed: " + err.message, type: "error" });
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/agent-modes", async (req, res) => {
  const { listAgentModes } = await import("../pipeline/agent-modes.mjs");
  res.json(listAgentModes());
});

router.post("/api/contexts/:id/research-round", async (req, res) => {
  const contextId = req.params.id;
  broadcast("toast", { message: "Starting adaptive research round...", type: "info" });

  try {
    const { runResearchRound } = await import("../pipeline/research-director.mjs");
    const result = await runResearchRound(contextId, {
      afterDate: req.body?.afterDate,
      beforeDate: req.body?.beforeDate,
      agentMode: req.body?.agentMode,
      onProgress: (event) => {
        broadcast("toast", { message: event.message, type: event.stage === "error" ? "error" : "info" });
      },
    });

    if (result.evidenceCount > 0) {
      broadcast("reload", { reason: "research round completed" });
    }
    res.json(result);
  } catch (err) {
    broadcast("toast", { message: "Research round failed: " + err.message, type: "error" });
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/contexts/:id/research-loop", async (req, res) => {
  const contextId = req.params.id;
  const maxRounds = parseInt(req.body?.maxRounds) || 3;
  broadcast("toast", { message: `Starting research loop (max ${maxRounds} rounds)...`, type: "info" });

  try {
    const { runResearchLoop } = await import("../pipeline/research-director.mjs");
    const result = await runResearchLoop(contextId, {
      maxRounds,
      afterDate: req.body?.afterDate,
      beforeDate: req.body?.beforeDate,
      agentMode: req.body?.agentMode,
      onProgress: (event) => {
        broadcast("toast", { message: event.message, type: event.stage === "error" ? "error" : "info" });
        if (event.stage === "done" && event.round) {
          broadcast("reload", { reason: `research round ${event.round} complete` });
        }
      },
    });

    broadcast("toast", { message: `Research loop complete: ${result.rounds} rounds, +${result.totalEvidence} evidence`, type: "info" });
    broadcast("reload", { reason: "research loop completed" });

    // Push research report as a modal
    const gaps = result.finalCoverage.gaps;
    const reportBody = [
      `## Research Loop Complete`,
      `**Rounds:** ${result.rounds} | **New evidence:** ${result.totalEvidence}`,
      ``,
      `### Coverage`,
      ...Object.entries(result.finalCoverage.stateDist || {}).sort((a, b) => b[1] - a[1]).map(([state, count]) => {
        const pct = Math.round(count / result.finalCoverage.totalEvidence * 100);
        return `- **${state}**: ${pct}% (${count})`;
      }),
      ``,
      gaps.length > 0
        ? `### Remaining Gaps\n${gaps.map(g => `- ${g.state}: ${g.actualPct}% (target ${g.targetPct}%)`).join("\n")}`
        : `### Coverage Balanced ✓`,
      ``,
      `### Decisions`,
      ...result.decisions.map(d => {
        let line = `**Round ${d.round}:** +${d.evidenceAdded} evidence, ${d.queriesUsed} queries`;
        if (d.thesisCheck && d.thesisCheck.status !== "confirmed") {
          line += `\n  *Thesis ${d.thesisCheck.status}:* ${d.thesisCheck.refinement || d.thesisCheck.reason}`;
        }
        return line;
      }),
    ].join("\n");

    broadcast("report", { title: "Adaptive Research Report", body: reportBody, format: "markdown" });

    res.json(result);
  } catch (err) {
    broadcast("toast", { message: "Research loop failed: " + err.message, type: "error" });
    res.status(500).json({ error: err.message });
  }
});

// --- LLM reclassification ---

router.post("/api/contexts/:id/reclassify", async (req, res) => {
  const contextId = req.params.id;
  broadcast("toast", { message: "Starting LLM reclassification for " + contextId + "...", type: "info" });

  try {
    const { reclassifyContext } = await import("../pipeline/llm-classifier.mjs");
    const { updated } = await reclassifyContext(contextId, {
      onProgress: ({ completed, total }) => {
        if (completed % 200 === 0) {
          broadcast("toast", { message: `Classified ${completed}/${total} packets...`, type: "info" });
        }
      },
    });

    broadcast("toast", { message: `Reclassified ${updated} packets. Refreshing signals...`, type: "info" });
    const result = refreshSignals(contextId);
    broadcast("reload", { reason: "reclassification completed" });
    broadcast("toast", { message: `Done: ${result.signalCount} signals refreshed with LLM classifications`, type: "info" });

    res.json({ updated, ...result });
  } catch (err) {
    broadcast("toast", { message: "Reclassification failed: " + err.message, type: "error" });
    res.status(500).json({ error: err.message });
  }
});

// --- Theme label generation ---

router.post("/api/contexts/:id/theme-labels", async (req, res) => {
  try {
    const { generateThemeLabels } = await import("../pipeline/theme-labeler.mjs");
    const labels = await generateThemeLabels(req.params.id);
    const themes = [...new Set(Object.values(labels))];
    broadcast("toast", { message: `Generated ${themes.length} theme labels`, type: "info" });
    res.json({ labels, themeCount: themes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Intelligence chain API ---

router.get("/api/signals/:id/chain", (req, res) => {
  const chain = getSignalChain(req.params.id);
  res.json(chain);
});

router.get("/api/intelligence/:unitId", (req, res) => {
  const chain = getChain(req.params.unitId, { maxDepth: parseInt(req.query.depth) || 5 });
  if (!chain) return res.status(404).json({ error: "Unit not found" });
  res.json(chain);
});

router.get("/api/contexts/:id/intelligence", (req, res) => {
  const chain = getContextChain(req.params.id, { minConfidence: parseFloat(req.query.minConfidence) || 0.3 });
  res.json(chain);
});

// --- Thread intelligence for a signal (read-only) ---

router.get("/api/signals/:id/intelligence", (req, res) => {
  const db = getDb();
  const signal = db.prepare("SELECT * FROM signals WHERE id = ?").get(req.params.id);
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  const intelligence = getSignalIntelligence(signal.id);
  res.json(intelligence);
});

// --- Drilldown chain: signal → evidence → thread → unified → case ---

router.get("/api/evidence/:id", (req, res) => {
  const db = getDb();
  const packet = db.prepare("SELECT * FROM evidence_packets WHERE id = ?").get(req.params.id);
  if (!packet) return res.status(404).json({ error: "Evidence packet not found" });

  let thread = null;
  if (packet.thread_id) {
    const tRow = db.prepare("SELECT * FROM threads WHERE id = ?").get(packet.thread_id);
    if (tRow) {
      const siblings = db.prepare(
        `SELECT ep.* FROM evidence_packets ep
         JOIN thread_packets tp ON tp.evidence_id = ep.id
         WHERE tp.thread_id = ?
         ORDER BY tp.position, ep.published_at`
      ).all(tRow.id);
      const intel = db.prepare(
        "SELECT * FROM thread_intelligence WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1"
      ).get(tRow.id);
      thread = {
        id: tRow.id,
        title: tRow.title,
        url: tRow.url,
        community: tRow.community,
        comment_count: tRow.comment_count,
        total_score: tRow.total_score,
        quality_tier: tRow.quality_tier,
        packets: siblings.map(formatEvidencePacket),
        intelligence: intel ? formatThreadIntelligence(intel) : null,
      };
    }
  }

  const citingSignals = db.prepare(
    `SELECT s.id, s.title, s.context_id, s.rank
     FROM signals s
     JOIN signal_evidence se ON se.signal_id = s.id
     WHERE se.evidence_id = ?`
  ).all(packet.id);

  const unifiedSignals = db.prepare(
    `SELECT us.id, us.topic, us.temporal_state, us.corroboration_score, use_.layer
     FROM unified_signals us
     JOIN unified_signal_evidence use_ ON use_.unified_signal_id = us.id
     WHERE use_.evidence_id = ?`
  ).all(packet.id);

  // Author + community drilldowns: surface sibling packets in the same context
  // so the drawer is actionable even when the packet has no real URL/thread.
  const relatedByAuthor = packet.author_ref
    ? db.prepare(
        `SELECT * FROM evidence_packets
         WHERE context_id = ? AND author_ref = ? AND id != ?
         ORDER BY evidence_weight DESC, published_at DESC
         LIMIT 8`
      ).all(packet.context_id, packet.author_ref, packet.id).map(formatEvidencePacket)
    : [];

  const relatedByCommunity = packet.community
    ? db.prepare(
        `SELECT * FROM evidence_packets
         WHERE context_id = ? AND community = ? AND id != ?
         ORDER BY evidence_weight DESC, published_at DESC
         LIMIT 8`
      ).all(packet.context_id, packet.community, packet.id).map(formatEvidencePacket)
    : [];

  const authorTotal = packet.author_ref
    ? db.prepare(
        `SELECT COUNT(*) AS c FROM evidence_packets
         WHERE context_id = ? AND author_ref = ? AND id != ?`
      ).get(packet.context_id, packet.author_ref, packet.id).c
    : 0;
  const communityTotal = packet.community
    ? db.prepare(
        `SELECT COUNT(*) AS c FROM evidence_packets
         WHERE context_id = ? AND community = ? AND id != ?`
      ).get(packet.context_id, packet.community, packet.id).c
    : 0;

  res.json({
    packet: formatEvidencePacket(packet),
    thread,
    citingSignals,
    unifiedSignals,
    relatedByAuthor,
    relatedByCommunity,
    authorTotal,
    communityTotal,
    contextId: packet.context_id,
  });
});

/**
 * Re-fetch a missing thread from its surviving hints. Used by the drawer
 * when /api/threads/:id 404s — usually because the thread was wiped but the
 * `intelligence_units` referencing it survived. The thread_id encodes the
 * Reddit post id (`thread:<post_id>`), so we can re-pull from Reddit.
 */
router.post("/api/threads/:id/regenerate", async (req, res) => {
  try {
    const result = await regenerateThread({
      threadId: req.params.id,
      contextId: req.body?.context_id,
    });
    res.status(result.ok ? 200 : 422).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/api/threads/:id", (req, res) => {
  const db = getDb();
  const thread = db.prepare("SELECT * FROM threads WHERE id = ?").get(req.params.id);
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  const packets = db.prepare(
    `SELECT ep.* FROM evidence_packets ep
     JOIN thread_packets tp ON tp.evidence_id = ep.id
     WHERE tp.thread_id = ?
     ORDER BY tp.position, ep.published_at`
  ).all(thread.id);

  const intel = db.prepare(
    "SELECT * FROM thread_intelligence WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(thread.id);

  const citingSignals = db.prepare(
    `SELECT DISTINCT s.id, s.title, s.context_id
     FROM signals s
     JOIN signal_evidence se ON se.signal_id = s.id
     JOIN thread_packets tp ON tp.evidence_id = se.evidence_id
     WHERE tp.thread_id = ?`
  ).all(thread.id);

  res.json({
    thread: {
      id: thread.id,
      title: thread.title,
      url: thread.url,
      community: thread.community,
      comment_count: thread.comment_count,
      total_score: thread.total_score,
      quality_tier: thread.quality_tier,
    },
    packets: packets.map(formatEvidencePacket),
    intelligence: intel ? formatThreadIntelligence(intel) : null,
    citingSignals,
  });
});

router.get("/api/signals/:id/chain-full", (req, res) => {
  const db = getDb();
  const signal = db.prepare("SELECT * FROM signals WHERE id = ?").get(req.params.id);
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  // Base signal fields
  const evidence = db.prepare(
    `SELECT ep.* FROM evidence_packets ep
     JOIN signal_evidence se ON se.evidence_id = ep.id
     WHERE se.signal_id = ?`
  ).all(signal.id);

  // Lifecycle row (1:1)
  const lifecycle = db.prepare(
    "SELECT * FROM signal_lifecycle WHERE signal_id = ?"
  ).get(signal.id) || null;

  // Case membership + siblings count
  const cases = db.prepare(
    `SELECT sc.id, sc.title, sc.description, sc.status,
            (SELECT COUNT(*) FROM signal_case_members WHERE case_id = sc.id) as member_count
     FROM signal_cases sc
     JOIN signal_case_members scm ON scm.case_id = sc.id
     WHERE scm.signal_id = ?`
  ).all(signal.id);

  // Unified signals that share at least one evidence packet with this signal
  const unified = db.prepare(
    `SELECT DISTINCT us.id, us.topic, us.description, us.thesis,
            us.temporal_state, us.corroboration_score,
            us.layer_coverage, us.missing_evidence, us.recommended_actions
     FROM unified_signals us
     JOIN unified_signal_evidence use_ ON use_.unified_signal_id = us.id
     JOIN signal_evidence se ON se.evidence_id = use_.evidence_id
     WHERE se.signal_id = ?
     ORDER BY us.corroboration_score DESC NULLS LAST`
  ).all(signal.id);

  // 7-layer coverage (covered vs missing) — same logic as /api/signals/:id, plus
  // an "augmented" flag if the layer is reachable through a unified signal.
  const allLayers = db.prepare("SELECT id, label, note FROM evidence_layers ORDER BY sort_order").all();
  const localLayerCounts = {};
  for (const ev of evidence) {
    if (!ev.source_layer) continue;
    localLayerCounts[ev.source_layer] = (localLayerCounts[ev.source_layer] || 0) + 1;
  }
  const unifiedLayerCounts = {};
  for (const u of unified) {
    const coverage = safeJson(u.layer_coverage, {});
    for (const [layer, count] of Object.entries(coverage)) {
      unifiedLayerCounts[layer] = (unifiedLayerCounts[layer] || 0) + (count || 0);
    }
  }
  // Aggregate missing-evidence callouts from unified signals
  const missingNotes = [];
  for (const u of unified) {
    const arr = safeJson(u.missing_evidence, []);
    for (const m of arr) if (typeof m === "string") missingNotes.push({ topic: u.topic, note: m });
  }

  const layerCoverage = allLayers.map(l => ({
    id: l.id,
    label: l.label,
    note: l.note,
    local_count: localLayerCounts[l.id] || 0,
    unified_count: unifiedLayerCounts[l.id] || 0,
    state: localLayerCounts[l.id]
      ? "covered"
      : (unifiedLayerCounts[l.id] ? "corroborated" : "missing"),
  }));

  res.json({
    ...signal,
    tags: safeJson(signal.tags, []),
    communities: safeJson(signal.communities, []),
    dominant_intent: signal.dominant_intent || "question",
    intent_mix: safeJson(signal.intent_mix, {}),
    awareness_distribution: safeJson(signal.awareness_distribution, {}),
    dominant_awareness: signal.dominant_awareness || null,
    desire_type: signal.desire_type || null,
    top_extractions: safeJson(signal.top_extractions, []),
    failed_solutions: safeJson(signal.failed_solutions, []),
    evidence: evidence.map(formatEvidencePacket),
    layerCoverage,
    lifecycle,
    cases,
    unified_signals: unified.map(u => ({
      id: u.id,
      topic: u.topic,
      description: u.description,
      thesis: u.thesis,
      temporal_state: u.temporal_state,
      corroboration_score: u.corroboration_score,
      layer_coverage: safeJson(u.layer_coverage, {}),
      missing_evidence: safeJson(u.missing_evidence, []),
      recommended_actions: safeJson(u.recommended_actions, []),
    })),
    missing_notes: missingNotes,
    freshness: computeFreshnessSummary(evidence),
    intelligence: getSignalIntelligenceSummary(signal.id),
    chain: getSignalChain(signal.id),
  });
});

/**
 * Reduce a list of evidence packets to {newest, oldest, median} ISO dates +
 * a day count for each. Powers the "Freshness" caption on the detail pane.
 */
function computeFreshnessSummary(packets) {
  const dates = (packets || [])
    .map(p => p.published_at)
    .filter(Boolean)
    .map(d => new Date(d).getTime())
    .filter(t => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (!dates.length) return null;
  const now = Date.now();
  const days = t => Math.max(0, Math.round((now - t) / 86400000));
  const median = dates[Math.floor(dates.length / 2)];
  return {
    count: dates.length,
    newest_at: new Date(dates[dates.length - 1]).toISOString(),
    oldest_at: new Date(dates[0]).toISOString(),
    median_at: new Date(median).toISOString(),
    newest_days: days(dates[dates.length - 1]),
    oldest_days: days(dates[0]),
    median_days: days(median),
  };
}

// --- Unified signals ---

router.get("/api/contexts/:id/unified-signals", (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, context_id, topic, description, thesis, temporal_state,
            corroboration_score, layer_coverage, missing_evidence,
            recommended_actions, first_detected, peak_at, updated_at
     FROM unified_signals
     WHERE context_id = ?
     ORDER BY corroboration_score DESC NULLS LAST, updated_at DESC`
  ).all(req.params.id);

  res.json(rows.map(r => ({
    id: r.id,
    context_id: r.context_id,
    topic: r.topic,
    description: r.description,
    thesis: r.thesis,
    temporal_state: r.temporal_state,
    corroboration_score: r.corroboration_score,
    layer_coverage: safeJson(r.layer_coverage, {}),
    missing_evidence: safeJson(r.missing_evidence, []),
    recommended_actions: safeJson(r.recommended_actions, []),
    first_detected: r.first_detected,
    peak_at: r.peak_at,
    updated_at: r.updated_at,
  })));
});

router.get("/api/unified-signals/:id", (req, res) => {
  const db = getDb();
  const u = db.prepare("SELECT * FROM unified_signals WHERE id = ?").get(req.params.id);
  if (!u) return res.status(404).json({ error: "Unified signal not found" });

  const evRows = db.prepare(
    `SELECT use_.layer, use_.relevance, ep.*
     FROM unified_signal_evidence use_
     JOIN evidence_packets ep ON ep.id = use_.evidence_id
     WHERE use_.unified_signal_id = ?
     ORDER BY use_.layer, use_.relevance DESC NULLS LAST`
  ).all(u.id);

  const layerAnalysis = safeJson(u.layer_analysis, {});
  const layers = {};
  for (const row of evRows) {
    if (!layers[row.layer]) {
      layers[row.layer] = { analysis: layerAnalysis[row.layer] || null, evidence: [] };
    }
    layers[row.layer].evidence.push({
      ...formatEvidencePacket(row),
      relevance: row.relevance,
    });
  }
  // Ensure every layer mentioned in layer_analysis has an entry even if no
  // evidence is currently linked (keeps the "what each layer said" coverage
  // visible even when packets were trimmed).
  for (const [layer, analysis] of Object.entries(layerAnalysis)) {
    if (!layers[layer]) layers[layer] = { analysis, evidence: [] };
  }

  // Signals that share evidence with this unified signal
  const linkedSignals = db.prepare(
    `SELECT DISTINCT s.id, s.title, s.context_id, s.rank
     FROM signals s
     JOIN signal_evidence se ON se.signal_id = s.id
     JOIN unified_signal_evidence use_ ON use_.evidence_id = se.evidence_id
     WHERE use_.unified_signal_id = ?
     ORDER BY s.rank`
  ).all(u.id);

  res.json({
    id: u.id,
    context_id: u.context_id,
    topic: u.topic,
    description: u.description,
    thesis: u.thesis,
    temporal_state: u.temporal_state,
    temporal_reasoning: u.temporal_reasoning,
    corroboration_score: u.corroboration_score,
    key_terms: safeJson(u.key_terms, []),
    layer_coverage: safeJson(u.layer_coverage, {}),
    missing_evidence: safeJson(u.missing_evidence, []),
    recommended_actions: safeJson(u.recommended_actions, []),
    first_detected: u.first_detected,
    peak_at: u.peak_at,
    layers,
    linkedSignals,
  });
});

router.get("/api/signals/:id/unified", (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT DISTINCT us.id, us.topic, us.temporal_state, us.corroboration_score,
            us.layer_coverage, us.missing_evidence
     FROM unified_signals us
     JOIN unified_signal_evidence use_ ON use_.unified_signal_id = us.id
     JOIN signal_evidence se ON se.evidence_id = use_.evidence_id
     WHERE se.signal_id = ?
     ORDER BY us.corroboration_score DESC NULLS LAST`
  ).all(req.params.id);

  res.json(rows.map(r => ({
    id: r.id,
    topic: r.topic,
    temporal_state: r.temporal_state,
    corroboration_score: r.corroboration_score,
    layer_coverage: safeJson(r.layer_coverage, {}),
    missing_evidence: safeJson(r.missing_evidence, []),
  })));
});

// --- Watched sources (the periodic-crawl registry) ---

router.get("/api/contexts/:id/watched-sources", (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, producer, kind, handle, label, url,
            evidence_count, signal_count, thread_count,
            first_seen_at, last_seen_at, pinned, muted, added_at, added_by
     FROM watched_sources
     WHERE context_id = ?
     ORDER BY pinned DESC, muted ASC, evidence_count DESC`
  ).all(req.params.id);

  // Group by producer for the UI
  const byProducer = {};
  for (const r of rows) {
    if (!byProducer[r.producer]) byProducer[r.producer] = [];
    byProducer[r.producer].push(r);
  }
  res.json({
    total: rows.length,
    pinned: rows.filter(r => r.pinned).length,
    muted: rows.filter(r => r.muted).length,
    sources: rows,
    byProducer,
  });
});

router.post("/api/watched-sources/:id/pin", (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT id, pinned FROM watched_sources WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Watched source not found" });
  const v = row.pinned ? 0 : 1;
  db.prepare("UPDATE watched_sources SET pinned = ?, muted = 0 WHERE id = ?").run(v, row.id);
  res.json({ id: row.id, pinned: v });
});

router.post("/api/watched-sources/:id/mute", (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT id, muted FROM watched_sources WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Watched source not found" });
  const v = row.muted ? 0 : 1;
  db.prepare("UPDATE watched_sources SET muted = ?, pinned = 0 WHERE id = ?").run(v, row.id);
  res.json({ id: row.id, muted: v });
});

// --- Cases (group/compare) ---

router.get("/api/contexts/:id/cases", (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT sc.id, sc.title, sc.description, sc.status, sc.created_at,
            COUNT(scm.signal_id) as member_count
     FROM signal_cases sc
     LEFT JOIN signal_case_members scm ON scm.case_id = sc.id
     WHERE sc.context_id = ?
     GROUP BY sc.id
     ORDER BY member_count DESC, sc.updated_at DESC`
  ).all(req.params.id);
  res.json(rows);
});

router.get("/api/cases/:id", (req, res) => {
  const db = getDb();
  const c = db.prepare("SELECT * FROM signal_cases WHERE id = ?").get(req.params.id);
  if (!c) return res.status(404).json({ error: "Case not found" });

  const members = db.prepare(
    `SELECT s.id, s.title, s.context_id, s.rank, s.confidence_tier,
            s.communities, s.mentions, s.dominant_state, s.dominant_intent,
            s.failed_solutions
     FROM signals s
     JOIN signal_case_members m ON m.signal_id = s.id
     WHERE m.case_id = ?
     ORDER BY s.rank`
  ).all(c.id);

  const facets = db.prepare(
    `SELECT sf.signal_id, sf.tag, sf.evidence_count, sf.thread_count,
            sf.quotes, sf.not_x_its_y, sf.failed_solutions, sf.avatar_clues,
            sf.awareness_level, sf.summary
     FROM signal_facets sf
     WHERE sf.signal_id IN (${members.map(() => "?").join(",") || "''"})`
  ).all(...members.map(m => m.id));

  // Build a tag → [{signal_id, facet}] overlap matrix so the UI can render
  // shared vs distinct patterns without recomputing on the client.
  const overlap = {};
  for (const f of facets) {
    if (!overlap[f.tag]) overlap[f.tag] = [];
    overlap[f.tag].push({
      signal_id: f.signal_id,
      evidence_count: f.evidence_count,
      thread_count: f.thread_count,
      quotes: safeJson(f.quotes, []),
      not_x_its_y: safeJson(f.not_x_its_y, []),
      failed_solutions: safeJson(f.failed_solutions, []),
      avatar_clues: safeJson(f.avatar_clues, []),
      awareness_level: f.awareness_level,
      summary: f.summary,
    });
  }

  res.json({
    case: c,
    members: members.map(m => ({
      ...m,
      communities: safeJson(m.communities, []),
      failed_solutions: safeJson(m.failed_solutions, []),
    })),
    overlap,
  });
});

function formatThreadIntelligence(ti) {
  return {
    id: ti.id,
    keyInsight: ti.key_insight,
    signalQuality: ti.signal_quality,
    conversationArc: ti.conversation_arc,
    awarenessLevel: ti.awareness_level,
    desireType: ti.desire_type,
    confidenceTier: ti.confidence_tier,
    painLanguage: safeJson(ti.pain_language, []),
    notXItsY: safeJson(ti.not_x_its_y, []),
    failedSolutions: safeJson(ti.failed_solutions, []),
    avatarClues: safeJson(ti.avatar_clues, []),
    emotionalDepth: ti.emotional_depth,
  };
}

function getSignalIntelligence(signalId) {
  const db = getDb();

  const threadIntels = db.prepare(`
    SELECT ti.*, t.title as thread_title, t.community, t.url as thread_url,
           t.comment_count, t.total_score
    FROM thread_intelligence ti
    JOIN threads t ON t.id = ti.thread_id
    JOIN thread_packets tp ON tp.thread_id = ti.thread_id
    JOIN signal_evidence se ON se.evidence_id = tp.evidence_id
    WHERE se.signal_id = ?
    GROUP BY ti.id
    ORDER BY ti.signal_quality DESC, t.total_score DESC
  `).all(signalId);

  if (threadIntels.length === 0) return { threads: [], summary: null };

  // Aggregate across threads
  const allPain = [];
  const allNxy = [];
  const allFailed = [];
  const allAvatarClues = [];
  const keyInsights = [];

  for (const ti of threadIntels) {
    const pain = safeJson(ti.pain_language, []);
    allPain.push(...pain);
    const nxy = safeJson(ti.not_x_its_y, []);
    allNxy.push(...nxy);
    const failed = safeJson(ti.failed_solutions, []);
    allFailed.push(...failed);
    const clues = safeJson(ti.avatar_clues, []);
    allAvatarClues.push(...clues);
    if (ti.key_insight) keyInsights.push(ti.key_insight);
  }

  return {
    threads: threadIntels.map(ti => ({
      threadId: ti.thread_id,
      title: ti.thread_title,
      community: ti.community,
      url: ti.thread_url,
      commentCount: ti.comment_count,
      signalQuality: ti.signal_quality,
      keyInsight: ti.key_insight,
      conversationArc: ti.conversation_arc,
      awarenessLevel: ti.awareness_level,
      desireType: ti.desire_type,
      confidenceTier: ti.confidence_tier,
      painLanguage: safeJson(ti.pain_language, []),
      notXItsY: safeJson(ti.not_x_its_y, []),
      failedSolutions: safeJson(ti.failed_solutions, []),
      avatarClues: safeJson(ti.avatar_clues, []),
    })),
    summary: {
      threadsAnalyzed: threadIntels.length,
      keyInsights,
      topPain: allPain.slice(0, 5),
      topNxy: allNxy.slice(0, 3),
      topFailed: allFailed.slice(0, 5),
      avatarClues: allAvatarClues.slice(0, 5),
    },
  };
}

export function buildFixtureData(fixtureId) {
  const db = getDb();
  const fixtureMeta = db.prepare("SELECT * FROM fixture_meta WHERE id = ?").get(fixtureId);
  if (!fixtureMeta) return null;
  return buildRadarData(fixtureMeta.context_id, fixtureId);
}

function formatSignal(row) {
  const db = getDb();
  const evidence = db.prepare(
    `SELECT ep.* FROM evidence_packets ep
     JOIN signal_evidence se ON se.evidence_id = ep.id
     WHERE se.signal_id = ?`
  ).all(row.id);

  const phrases = db.prepare("SELECT phrase, count FROM signal_phrases WHERE signal_id = ?").all(row.id);
  const spread = db.prepare("SELECT community, percentage FROM signal_spread WHERE signal_id = ?").all(row.id);
  const related = db.prepare("SELECT label, tag, score FROM signal_related WHERE signal_id = ?").all(row.id);

  return {
    id: row.id,
    rank: row.rank,
    status: row.status,
    title: row.title,
    growth: row.growth,
    tags: safeJson(row.tags, []),
    summary: row.summary,
    communities: safeJson(row.communities, []),
    mentions: row.mentions,
    comments: row.comments,
    confidence: row.confidence,
    x: row.bubble_x,
    y: row.bubble_y,
    r: row.bubble_r,
    volume: row.volume,
    why: row.why,
    dominant_intent: row.dominant_intent || "question",
    intent_mix: safeJson(row.intent_mix, {}),
    awareness_distribution: safeJson(row.awareness_distribution, {}),
    dominant_awareness: row.dominant_awareness || null,
    sentiment_distribution: safeJson(row.sentiment_distribution, {}),
    dominant_sentiment: row.dominant_sentiment || "neutral",
    state_distribution: safeJson(row.state_distribution, {}),
    dominant_state: row.dominant_state || "sharing_insight",
    desire_type: row.desire_type || null,
    top_extractions: safeJson(row.top_extractions, []),
    failed_solutions: safeJson(row.failed_solutions, []),
    suggested: {
      title: row.suggested_title || "Suggested action",
      sub: row.suggested_sub || "",
    },
    next: row.next_source || "",
    saved: row.saved || 0,
    dismissed: row.dismissed || 0,
    alerted: row.alerted || 0,
    confidence_tier: row.confidence_tier || null,
    evidence: evidence.map(formatEvidencePacket),
    phrases: phrases.map(p => [p.phrase, p.count]),
    spread: spread.map(s => [s.community, s.percentage]),
    related: related.map(r => [r.label, r.tag, r.score]),
    intelligence: getSignalIntelligenceSummary(row.id),
    facets: getSignalFacets(row.id),
    vocabulary: getSignalVocabulary(row.id),
  };
}

function getSignalVocabulary(signalId) {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM signal_vocabulary WHERE signal_id = ? ORDER BY category, (frequency * 10 + total_upvotes) DESC"
  ).all(signalId);

  if (rows.length === 0) return null;

  const byCategory = {};
  for (const r of rows) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push({
      phrase: r.phrase,
      frequency: r.frequency,
      upvotes: r.total_upvotes,
      quote: r.example_quote,
      url: r.example_url,
    });
  }
  return byCategory;
}

function getSignalFacets(signalId) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM signal_facets WHERE signal_id = ?").all(signalId);
  const facets = {};
  for (const f of rows) {
    facets[f.tag] = {
      evidenceCount: f.evidence_count,
      threadCount: f.thread_count,
      totalUpvotes: f.total_upvotes,
      quotes: safeJson(f.quotes, []),
      notXItsY: safeJson(f.not_x_its_y, []),
      failedSolutions: safeJson(f.failed_solutions, []),
      avatarClues: safeJson(f.avatar_clues, []),
      awarenessLevel: f.awareness_level,
      summary: f.summary,
    };
  }
  return facets;
}

function getSignalIntelligenceSummary(signalId) {
  const db = getDb();
  const threadIntels = db.prepare(`
    SELECT ti.key_insight, ti.signal_quality, ti.awareness_level, ti.desire_type,
           ti.conversation_arc, ti.not_x_its_y, ti.failed_solutions, ti.pain_language,
           ti.avatar_clues, ti.confidence_tier,
           t.title as thread_title, t.community, t.url as thread_url, t.comment_count
    FROM thread_intelligence ti
    JOIN threads t ON t.id = ti.thread_id
    JOIN thread_packets tp ON tp.thread_id = ti.thread_id
    JOIN signal_evidence se ON se.evidence_id = tp.evidence_id
    WHERE se.signal_id = ? AND ti.signal_quality != 'noise'
    GROUP BY ti.id
    ORDER BY t.total_score DESC
    LIMIT 10
  `).all(signalId);

  if (threadIntels.length === 0) return null;

  return {
    count: threadIntels.length,
    threads: threadIntels.map(ti => ({
      title: ti.thread_title,
      community: ti.community,
      url: ti.thread_url,
      commentCount: ti.comment_count,
      quality: ti.signal_quality,
      keyInsight: ti.key_insight,
      arc: ti.conversation_arc,
      awareness: ti.awareness_level,
      desire: ti.desire_type,
      tier: ti.confidence_tier,
      notXItsY: safeJson(ti.not_x_its_y, []),
      failedSolutions: safeJson(ti.failed_solutions, []),
      painLanguage: safeJson(ti.pain_language, []).slice(0, 3),
      avatarClues: safeJson(ti.avatar_clues, []).slice(0, 2),
    })),
  };
}

function formatEvidencePacket(row) {
  const metrics = safeJson(row.metrics, {});
  const sid = row.source_item_id || "";
  return {
    id: row.id,
    source_item_id: sid,
    thread_id: row.thread_id || null,
    isComment: sid.startsWith("t1_"),
    title: row.title || "",
    quote: row.body || row.title || "",
    source: row.community || row.source_id || "source",
    source_id: row.source_id || "",
    source_layer: row.source_layer || "",
    source_kind: row.source_kind || null,
    intent: row.intent || "question",
    awareness_level: row.awareness_level || null,
    sentiment: row.sentiment || "neutral",
    evidence_state: row.evidence_state || "sharing_insight",
    evidence_weight: row.evidence_weight || 1.0,
    quality_score: row.quality_score || null,
    author: row.author_ref || "anonymous",
    age: relativeAge(row.published_at),
    published_at: row.published_at || null,
    observed_at: row.observed_at || null,
    score: metrics.score || 0,
    replies: metrics.comments || metrics.replies || 0,
    url: row.url || "#",
  };
}

function relativeAge(isoDate) {
  if (!isoDate) return "replay";
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return "replay";
  const days = Math.max(0, Math.round((Date.now() - then) / 86400000));
  return days <= 0 ? "today" : days + "d";
}

export default router;
