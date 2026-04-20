import { Router } from "express";
import { getDb } from "../db/connection.mjs";
import { ingestReddit } from "../pipeline/ingest.mjs";

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
  const signal = db.prepare("SELECT id, saved FROM signals WHERE id = ?").get(req.params.id);
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  const newValue = signal.saved ? 0 : 1;
  db.prepare("UPDATE signals SET saved = ?, updated_at = datetime('now') WHERE id = ?").run(newValue, req.params.id);
  res.json({ id: req.params.id, saved: newValue });
});

router.post("/api/signals/:id/dismiss", (req, res) => {
  const db = getDb();
  const signal = db.prepare("SELECT id, dismissed FROM signals WHERE id = ?").get(req.params.id);
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  const newValue = signal.dismissed ? 0 : 1;
  db.prepare("UPDATE signals SET dismissed = ?, updated_at = datetime('now') WHERE id = ?").run(newValue, req.params.id);
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
    evidence: evidence.map(formatEvidencePacket),
    phrases: phrases.map(p => [p.phrase, p.count]),
    spread: spread.map(s => [s.community, s.percentage]),
    related: related.map(r => [r.label, r.tag, r.score]),
  };
}

function formatEvidencePacket(row) {
  const metrics = safeJson(row.metrics, {});
  return {
    id: row.id,
    quote: row.body || row.title || "",
    source: row.community || row.source_id || "source",
    source_id: row.source_id || "",
    source_layer: row.source_layer || "",
    intent: row.intent || "question",
    awareness_level: row.awareness_level || null,
    evidence_weight: row.evidence_weight || 1.0,
    quality_score: row.quality_score || null,
    author: row.author_ref || "anonymous",
    age: relativeAge(row.published_at),
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
