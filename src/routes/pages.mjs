import { Router } from "express";
import { getDb } from "../db/connection.mjs";
import { buildRadarData } from "./api.mjs";
import { listAgentModes, getAgentMode } from "../pipeline/agent-modes.mjs";

const router = Router();

function getStats(db, contextId) {
  return {
    signals: db.prepare("SELECT COUNT(*) as c FROM signals WHERE context_id = ? AND dismissed = 0").get(contextId).c,
    saved: db.prepare("SELECT COUNT(*) as c FROM signals WHERE context_id = ? AND saved = 1").get(contextId).c,
    evidence: db.prepare("SELECT COUNT(*) as c FROM evidence_packets WHERE context_id = ?").get(contextId).c,
    communities: db.prepare("SELECT COUNT(DISTINCT community) as c FROM evidence_packets WHERE context_id = ?").get(contextId).c,
  };
}

function resolveContext(db, req) {
  const contexts = db.prepare("SELECT * FROM contexts ORDER BY label").all();
  if (!contexts.length) return null;
  const requestedId = req.query.context;
  const activeContext = (requestedId && contexts.find(c => c.id === requestedId)) || contexts[0];
  return { contexts, activeContext };
}

const emptyPage = `<!doctype html><html><head><meta charset="utf-8"><title>Signals</title><link rel="stylesheet" href="/style.css"></head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--bg)"><div style="text-align:center;max-width:420px"><div style="font-size:48px;margin-bottom:16px">S</div><h2 style="margin:0 0 8px">No contexts found</h2><p style="color:var(--faint);margin:0 0 20px">Run <code style="background:#f1f3f5;padding:2px 6px;border-radius:4px">pnpm run seed</code> to load fixture data, then reload this page.</p></div></body></html>`;

router.get("/", (req, res) => {
  const db = getDb();
  const resolved = resolveContext(db, req);
  if (!resolved) return res.send(emptyPage);

  const { contexts, activeContext } = resolved;
  const fixtures = db.prepare("SELECT id, label FROM fixture_meta ORDER BY label").all();
  const activeFixtureId = req.query.fixture || (fixtures[0] && fixtures[0].id) || "default";
  const radarData = buildRadarData(activeContext.id, activeFixtureId);
  const stats = getStats(db, activeContext.id);

  res.render("layout", {
    contexts,
    activeContext,
    fixtures,
    activeFixtureId,
    radarData,
    page: "radar",
    stats,
  });
});

router.get("/evidence", (req, res) => {
  const db = getDb();
  const resolved = resolveContext(db, req);
  if (!resolved) return res.send(emptyPage);

  const { contexts, activeContext } = resolved;
  const stats = getStats(db, activeContext.id);

  // Get evidence for this context
  const evidence = db.prepare(
    `SELECT ep.*, se.signal_id, s.title as signal_title
     FROM evidence_packets ep
     LEFT JOIN signal_evidence se ON se.evidence_id = ep.id
     LEFT JOIN signals s ON s.id = se.signal_id
     WHERE ep.context_id = ?
     ORDER BY ep.published_at DESC`
  ).all(activeContext.id);

  const sources = db.prepare(
    "SELECT DISTINCT source_id FROM evidence_packets WHERE context_id = ? ORDER BY source_id"
  ).all(activeContext.id).map(r => r.source_id);

  const communities = db.prepare(
    "SELECT DISTINCT community FROM evidence_packets WHERE context_id = ? AND community IS NOT NULL AND community != '' ORDER BY community"
  ).all(activeContext.id).map(r => r.community);

  const intents = db.prepare(
    "SELECT DISTINCT intent FROM evidence_packets WHERE context_id = ? AND intent IS NOT NULL AND intent != '' ORDER BY intent"
  ).all(activeContext.id).map(r => r.intent);

  // Thread intelligence for collapsed summaries
  const threadInsights = {};
  const tiRows = db.prepare(
    `SELECT ti.thread_id, ti.key_insight FROM thread_intelligence ti
     JOIN threads t ON t.id = ti.thread_id
     WHERE t.context_id = ? AND ti.signal_quality != 'noise' AND ti.key_insight IS NOT NULL`
  ).all(activeContext.id);
  for (const row of tiRows) threadInsights[row.thread_id] = row.key_insight;

  res.render("evidence", {
    contexts,
    activeContext,
    page: "evidence",
    stats,
    evidence,
    sources,
    communities,
    intents,
    threadInsights,
  });
});

router.get("/watchlist", (req, res) => {
  const db = getDb();
  const resolved = resolveContext(db, req);
  if (!resolved) return res.send(emptyPage);

  const { contexts, activeContext } = resolved;
  const stats = getStats(db, activeContext.id);

  const saved = db.prepare(
    `SELECT s.*, GROUP_CONCAT(se.evidence_id) as evidence_ids
     FROM signals s
     LEFT JOIN signal_evidence se ON se.signal_id = s.id
     WHERE s.context_id = ? AND s.saved = 1 AND s.dismissed = 0
     GROUP BY s.id
     ORDER BY s.rank`
  ).all(activeContext.id);

  const dismissed = db.prepare(
    `SELECT s.id, s.title, s.status, s.tags, s.communities, s.confidence
     FROM signals s
     WHERE s.context_id = ? AND s.dismissed = 1
     ORDER BY s.updated_at DESC`
  ).all(activeContext.id);

  res.render("watchlist", {
    contexts,
    activeContext,
    page: "watchlist",
    stats,
    saved,
    dismissed,
  });
});

router.get("/communities", (req, res) => {
  const db = getDb();
  const resolved = resolveContext(db, req);
  if (!resolved) return res.send(emptyPage);

  const { contexts, activeContext } = resolved;
  const stats = getStats(db, activeContext.id);

  const communities = db.prepare(
    `SELECT community,
            COUNT(*) as evidence_count,
            COUNT(DISTINCT se.signal_id) as signal_count,
            MIN(ep.published_at) as first_seen,
            MAX(ep.published_at) as last_seen
     FROM evidence_packets ep
     LEFT JOIN signal_evidence se ON se.evidence_id = ep.id
     WHERE ep.context_id = ? AND ep.community IS NOT NULL AND ep.community != ''
     GROUP BY ep.community
     ORDER BY evidence_count DESC`
  ).all(activeContext.id);

  res.render("communities", {
    contexts,
    activeContext,
    page: "communities",
    stats,
    communities,
  });
});

router.get("/lens/:name", (req, res) => {
  const db = getDb();
  const resolved = resolveContext(db, req);
  if (!resolved) return res.send(emptyPage);

  const { contexts, activeContext } = resolved;
  const stats = getStats(db, activeContext.id);
  const allLenses = listAgentModes();
  const lensId = req.params.name;
  const lensInfo = allLenses.find(l => l.id === lensId);
  if (!lensInfo) return res.status(404).send(`Lens not found: ${lensId}. Available: ${allLenses.map(l => l.id).join(", ")}`);

  const signals = db.prepare(`
    SELECT s.id, s.title, s.status, s.dominant_state, s.mentions,
           ss.total, ss.rank_in_ctx, ss.components
    FROM signal_scores ss
    JOIN signals s ON s.id = ss.signal_id
    WHERE s.context_id = ? AND ss.lens = ?
    ORDER BY ss.rank_in_ctx
  `).all(activeContext.id, lensId).map(r => {
    let topComponents = [];
    try {
      const arr = JSON.parse(r.components);
      topComponents = arr
        .filter(c => c.weighted > 0)
        .sort((a, b) => b.weighted - a.weighted)
        .slice(0, 4);
    } catch { /* ignore */ }
    return { ...r, topComponents };
  });

  res.render("lens", {
    contexts,
    activeContext,
    page: "lens",
    stats,
    lensInfo,
    allLenses,
    signals,
  });
});

export default router;
