/**
 * Intelligence Chain — append-only graph of linked intelligence units.
 *
 * Every finding in the system becomes an immutable, content-addressed unit
 * that references what it was built on. Walk backwards from any claim
 * to the original Reddit comment.
 *
 * Levels:
 *   0: observation  — single evidence packet (high-signal only)
 *   1: extraction   — thread intelligence finding (LLM)
 *   2: cross_thread — facet synthesis (aggregation across threads)
 *   3: cross_community — signal case (pattern across communities)
 *   4: synthesis    — research brief section
 *   5: conclusion   — human confirmation/dismissal
 */

import { createHash } from "node:crypto";
import { getDb } from "../db/connection.mjs";

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Content-addressed unit ID. Same finding from same source = same ID.
 */
function unitId(unitType, claim, sourceId) {
  const input = `${unitType}:${claim}:${sourceId || ""}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "\u2026" : str;
}

/**
 * Create a single intelligence unit. Idempotent — skips if ID exists.
 */
export function createUnit({
  unitType, claim, detail, sourceType, sourceId, method,
  parentIds, contextId, signalId, community, threadId,
  confidence, confidenceBasis, createdBy,
}) {
  const db = getDb();
  const id = unitId(unitType, claim, sourceId);
  const parents = parentIds && parentIds.length > 0 ? JSON.stringify(parentIds) : null;

  db.prepare(`
    INSERT OR IGNORE INTO intelligence_units
    (id, unit_type, claim, detail, source_type, source_id, method, parent_ids,
     context_id, signal_id, community, thread_id,
     confidence, confidence_basis, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, unitType, claim, detail || null,
    sourceType || null, sourceId || null, method || null, parents,
    contextId || null, signalId || null, community || null, threadId || null,
    confidence || 0.5, confidenceBasis || null, createdBy || null
  );

  // Create parent links
  if (parentIds && parentIds.length > 0) {
    const insertLink = db.prepare(
      `INSERT OR IGNORE INTO intelligence_links (from_id, to_id, link_type, weight) VALUES (?, ?, 'supports', 1.0)`
    );
    for (const parentId of parentIds) {
      insertLink.run(id, parentId);
    }
  }

  return id;
}

/**
 * Create multiple units in a single transaction.
 */
export function createUnits(units) {
  const db = getDb();
  const ids = [];
  const run = db.transaction(() => {
    for (const u of units) {
      ids.push(createUnit(u));
    }
  });
  run();
  return ids;
}

/**
 * Create a link between two units.
 */
export function linkUnits(fromId, toId, linkType, weight = 1.0) {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO intelligence_links (from_id, to_id, link_type, weight) VALUES (?, ?, ?, ?)`
  ).run(fromId, toId, linkType, weight);
}

/**
 * Get the chain for a single unit (walk parents up to maxDepth).
 */
export function getChain(targetId, options = {}) {
  const db = getDb();
  const maxDepth = options.maxDepth || 5;

  const unit = db.prepare("SELECT * FROM intelligence_units WHERE id = ?").get(targetId);
  if (!unit) return null;

  function walkParents(uid, depth) {
    if (depth >= maxDepth) return [];
    const parentIds = safeParseJson(
      db.prepare("SELECT parent_ids FROM intelligence_units WHERE id = ?").get(uid)?.parent_ids,
      []
    );
    return parentIds.map(pid => {
      const parent = db.prepare("SELECT * FROM intelligence_units WHERE id = ?").get(pid);
      if (!parent) return null;
      const link = db.prepare(
        "SELECT link_type, weight FROM intelligence_links WHERE from_id = ? AND to_id = ?"
      ).get(uid, pid);
      return {
        unit: formatUnit(parent),
        linkType: link?.link_type || "supports",
        parents: walkParents(pid, depth + 1),
      };
    }).filter(Boolean);
  }

  // Also get children (units that reference this one)
  const children = db.prepare(
    "SELECT iu.* FROM intelligence_units iu WHERE iu.parent_ids LIKE ?"
  ).all(`%${targetId}%`).map(formatUnit);

  return {
    unit: formatUnit(unit),
    parents: walkParents(targetId, 0),
    children,
  };
}

/**
 * Get all intelligence units for a signal, organized by level.
 */
export function getSignalChain(signalId) {
  const db = getDb();

  const units = db.prepare(
    `SELECT * FROM intelligence_units WHERE signal_id = ? ORDER BY unit_type, confidence DESC`
  ).all(signalId);

  // Also get units linked through evidence packets
  const evidenceUnits = db.prepare(
    `SELECT iu.* FROM intelligence_units iu
     WHERE iu.source_type = 'evidence_packet'
     AND iu.source_id IN (SELECT evidence_id FROM signal_evidence WHERE signal_id = ?)`
  ).all(signalId);

  // And thread-level units
  const threadUnits = db.prepare(
    `SELECT iu.* FROM intelligence_units iu
     WHERE iu.source_type = 'thread_intelligence'
     AND iu.thread_id IN (
       SELECT DISTINCT ep.thread_id FROM evidence_packets ep
       JOIN signal_evidence se ON se.evidence_id = ep.id
       WHERE se.signal_id = ? AND ep.thread_id IS NOT NULL
     )`
  ).all(signalId);

  const all = new Map();
  for (const u of [...units, ...evidenceUnits, ...threadUnits]) {
    all.set(u.id, u);
  }

  const byType = {
    observation: [],
    extraction: [],
    cross_thread: [],
    cross_community: [],
    synthesis: [],
    conclusion: [],
  };

  for (const u of all.values()) {
    if (byType[u.unit_type]) byType[u.unit_type].push(formatUnit(u));
  }

  return {
    signalId,
    totalUnits: all.size,
    byType,
  };
}

/**
 * Get context-level intelligence summary.
 */
export function getContextChain(contextId, options = {}) {
  const db = getDb();

  const counts = db.prepare(`
    SELECT unit_type, COUNT(*) as count, AVG(confidence) as avg_confidence
    FROM intelligence_units WHERE context_id = ?
    GROUP BY unit_type
  `).all(contextId);

  const topUnits = db.prepare(`
    SELECT * FROM intelligence_units
    WHERE context_id = ? AND confidence >= ?
    ORDER BY confidence DESC, created_at DESC
    LIMIT 20
  `).all(contextId, options.minConfidence || 0.5);

  return {
    contextId,
    counts: counts.reduce((acc, r) => { acc[r.unit_type] = { count: r.count, avgConfidence: Math.round(r.avg_confidence * 100) / 100 }; return acc; }, {}),
    topUnits: topUnits.map(formatUnit),
  };
}

/**
 * Refresh support/contradiction counts and propagate confidence.
 */
export function refreshSupportCounts(contextId) {
  const db = getDb();

  const units = db.prepare(
    "SELECT id, confidence FROM intelligence_units WHERE context_id = ?"
  ).all(contextId);

  const update = db.prepare(
    "UPDATE intelligence_units SET supporting_count = ?, contradicting_count = ?, confidence = ? WHERE id = ?"
  );

  const refresh = db.transaction(() => {
    for (const unit of units) {
      const supporting = db.prepare(
        "SELECT COUNT(*) as c FROM intelligence_links WHERE to_id = ? AND link_type = 'supports'"
      ).get(unit.id).c;
      const contradicting = db.prepare(
        "SELECT COUNT(*) as c FROM intelligence_links WHERE to_id = ? AND link_type = 'contradicts'"
      ).get(unit.id).c;

      // Propagate confidence: base * boost from support, penalty from contradiction
      let conf = unit.confidence * (1 + supporting * 0.05) * (1 - contradicting * 0.1);
      conf = Math.max(0.05, Math.min(0.99, conf));

      update.run(supporting, contradicting, conf, unit.id);
    }
  });

  refresh();
}

/**
 * Get observation unit IDs for a set of evidence packet IDs.
 * Used by hooks to find parent units.
 */
export function getObservationIds(packetIds) {
  if (!packetIds || packetIds.length === 0) return [];
  const db = getDb();
  const placeholders = packetIds.map(() => "?").join(",");
  return db.prepare(
    `SELECT id FROM intelligence_units WHERE source_type = 'evidence_packet' AND source_id IN (${placeholders})`
  ).all(...packetIds).map(r => r.id);
}

/**
 * Get extraction unit IDs for threads.
 */
export function getExtractionIds(threadIds) {
  if (!threadIds || threadIds.length === 0) return [];
  const db = getDb();
  const placeholders = threadIds.map(() => "?").join(",");
  return db.prepare(
    `SELECT id FROM intelligence_units WHERE unit_type = 'extraction' AND thread_id IN (${placeholders})`
  ).all(...threadIds).map(r => r.id);
}

/**
 * Get cross_thread unit IDs for a signal.
 */
export function getCrossThreadIds(signalId) {
  const db = getDb();
  return db.prepare(
    `SELECT id FROM intelligence_units WHERE unit_type = 'cross_thread' AND signal_id = ?`
  ).all(signalId).map(r => r.id);
}

function formatUnit(row) {
  return {
    id: row.id,
    type: row.unit_type,
    claim: row.claim,
    detail: row.detail,
    sourceType: row.source_type,
    sourceId: row.source_id,
    method: row.method,
    parentIds: safeParseJson(row.parent_ids, []),
    contextId: row.context_id,
    signalId: row.signal_id,
    community: row.community,
    threadId: row.thread_id,
    confidence: row.confidence,
    confidenceBasis: row.confidence_basis,
    supportingCount: row.supporting_count,
    contradictingCount: row.contradicting_count,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}
