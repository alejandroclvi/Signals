#!/usr/bin/env node
/**
 * Sync the SQLite evidence graph for a context into Neo4j.
 *
 * Idempotent: uses MERGE on stable IDs. Re-running updates properties and adds
 * new nodes/edges without duplicating.
 *
 * Usage:
 *   node scripts/sync-graph.mjs <context-id>
 *   node scripts/sync-graph.mjs --all
 */

import "../src/lib/env.mjs";
import { getDb } from "../src/db/connection.mjs";
import { cypher, isGraphConfigured } from "../src/graph/client.mjs";

const TAXONOMY = {
  layers: [
    { id: "conversation", order: 1, label: "Conversation" },
    { id: "intent",       order: 2, label: "Intent" },
    { id: "expectation",  order: 3, label: "Expectation" },
    { id: "behavior",     order: 4, label: "Behavior" },
    { id: "economic",     order: 5, label: "Economic" },
    { id: "capital",      order: 6, label: "Capital Market" },
  ],
  sources: [
    { id: "reddit",     name: "Reddit",        layer: "conversation" },
    { id: "hackernews", name: "Hacker News",   layer: "conversation" },
    { id: "google",     name: "Google Search", layer: "intent" },
    { id: "github",     name: "GitHub",        layer: "behavior" },
    { id: "polymarket", name: "Polymarket",    layer: "expectation" },
    { id: "equity",     name: "Equity Market", layer: "capital" },
    { id: "g2",         name: "G2 Reviews",    layer: "economic" },
  ],
  states: [
    "experiencing_pain", "seeking", "tried_failed", "found_what_works",
    "sharing_insight", "comparing", "warning", "promoting", "unclassified",
  ],
};

function safeJson(v, f) { try { return typeof v === "string" ? JSON.parse(v) : (v ?? f); } catch { return f; } }
function dayOf(iso)     { return iso ? iso.slice(0, 10) : null; }

async function ensureSchema() {
  const writes = [
    "CREATE CONSTRAINT context_id IF NOT EXISTS FOR (n:Context)   REQUIRE n.id   IS UNIQUE",
    "CREATE CONSTRAINT layer_id   IF NOT EXISTS FOR (n:Layer)     REQUIRE n.id   IS UNIQUE",
    "CREATE CONSTRAINT source_id  IF NOT EXISTS FOR (n:Source)    REQUIRE n.id   IS UNIQUE",
    "CREATE CONSTRAINT comm_id    IF NOT EXISTS FOR (n:Community) REQUIRE n.id   IS UNIQUE",
    "CREATE CONSTRAINT author_id  IF NOT EXISTS FOR (n:Author)    REQUIRE n.id   IS UNIQUE",
    "CREATE CONSTRAINT state_id   IF NOT EXISTS FOR (n:State)     REQUIRE n.id   IS UNIQUE",
    "CREATE CONSTRAINT day_date   IF NOT EXISTS FOR (n:Day)       REQUIRE n.date IS UNIQUE",
    "CREATE CONSTRAINT theme_id   IF NOT EXISTS FOR (n:Theme)     REQUIRE n.id   IS UNIQUE",
    "CREATE CONSTRAINT signal_id  IF NOT EXISTS FOR (n:Signal)    REQUIRE n.id   IS UNIQUE",
    "CREATE CONSTRAINT evid_id    IF NOT EXISTS FOR (n:Evidence)  REQUIRE n.id   IS UNIQUE",
    "CREATE INDEX evid_ctx        IF NOT EXISTS FOR (n:Evidence)  ON (n.contextId)",
    "CREATE INDEX evid_published  IF NOT EXISTS FOR (n:Evidence)  ON (n.publishedAt)",
    "CREATE INDEX signal_ctx      IF NOT EXISTS FOR (n:Signal)    ON (n.contextId)",
  ];
  for (const stmt of writes) {
    try { await cypher(stmt); } catch (err) { /* schema DDL may already exist */ }
  }
}

async function loadTaxonomy() {
  await cypher(
    `UNWIND $layers AS l MERGE (n:Layer {id: l.id}) SET n.order = l.order, n.label = l.label`,
    { layers: TAXONOMY.layers }
  );
  await cypher(
    `UNWIND $sources AS s
     MERGE (src:Source {id: s.id}) SET src.name = s.name
     WITH src, s MATCH (l:Layer {id: s.layer}) MERGE (src)-[:AT]->(l)`,
    { sources: TAXONOMY.sources }
  );
  await cypher(`UNWIND $states AS s MERGE (n:State {id: s})`, { states: TAXONOMY.states });
}

async function syncContext(contextId) {
  const db = getDb();
  const ctx = db.prepare("SELECT id, label, COALESCE(agent_mode,'research') AS agentMode FROM contexts WHERE id = ?").get(contextId);
  if (!ctx) throw new Error(`Context not found: ${contextId}`);

  const evidence = db.prepare(`
    SELECT id, context_id, COALESCE(source_id,'reddit') AS source_id,
           source_kind, source_layer, community,
           COALESCE(author_ref,'unknown') AS author,
           COALESCE(evidence_state,'unclassified') AS state,
           evidence_weight, quality_score, published_at
    FROM evidence_packets
    WHERE context_id = ? AND published_at IS NOT NULL
  `).all(contextId).map(r => ({ ...r, day: dayOf(r.published_at) }));

  const signals = db.prepare(`
    SELECT id, context_id, title, status, mentions, dominant_state, dominant_intent, tags, communities
    FROM signals WHERE context_id = ?
  `).all(contextId).map(s => ({
    ...s,
    tags: safeJson(s.tags, []),
    communities: safeJson(s.communities, []),
  }));

  const links = db.prepare(`
    SELECT se.signal_id, se.evidence_id
    FROM signal_evidence se JOIN signals s ON s.id = se.signal_id
    WHERE s.context_id = ?
  `).all(contextId);

  await cypher(
    `MERGE (c:Context {id: $ctx.id})
     SET c.label = $ctx.label, c.agentMode = $ctx.agentMode`,
    { ctx }
  );

  // Evidence + Day + State + Community + Author + Source link
  // Multi-source: r.source_id is reddit | hackernews | polymarket | stocks
  await cypher(
    `UNWIND $rows AS r
     MERGE (e:Evidence {id: r.id})
     SET e.contextId = r.context_id, e.sourceId = r.source_id, e.sourceKind = r.source_kind,
         e.community = r.community, e.author = r.author, e.state = r.state,
         e.weight = r.evidence_weight, e.qualityScore = r.quality_score,
         e.publishedAt = r.published_at, e.day = r.day
     WITH e, r
     MATCH (c:Context {id: r.context_id}) MERGE (e)-[:IN_CONTEXT]->(c)
     MERGE (d:Day {date: r.day})
       ON CREATE SET d.year = toInteger(substring(r.day,0,4)), d.month = toInteger(substring(r.day,5,2))
     MERGE (e)-[:ON_DAY]->(d)
     MERGE (st:State {id: r.state}) MERGE (e)-[:HAS_STATE]->(st)
     WITH e, r, (r.source_id + ':' + r.community) AS commId, (r.source_id + ':' + r.author) AS authId
     MERGE (com:Community {id: commId})
       ON CREATE SET com.name = r.community, com.sourceId = r.source_id
     WITH e, com, r, authId
     OPTIONAL MATCH (src:Source {id: r.source_id})
     FOREACH (s IN CASE WHEN src IS NULL THEN [] ELSE [src] END |
       MERGE (com)-[:ON]->(s))
     MERGE (e)-[:FROM]->(com)
     MERGE (a:Author {id: authId})
       ON CREATE SET a.name = r.author, a.sourceId = r.source_id
     MERGE (e)-[:BY]->(a)`,
    { rows: evidence }
  );

  // Signals + Themes
  await cypher(
    `UNWIND $rows AS s
     MERGE (sig:Signal {id: s.id})
     SET sig.title = s.title, sig.status = s.status, sig.mentions = s.mentions,
         sig.dominantState = s.dominant_state, sig.dominantIntent = s.dominant_intent,
         sig.contextId = s.context_id
     WITH sig, s
     MATCH (c:Context {id: s.context_id}) MERGE (sig)-[:IN_CONTEXT]->(c)
     WITH sig, s
     UNWIND s.tags AS tag
     MERGE (t:Theme {id: tag}) SET t.label = tag
     MERGE (sig)-[:ABOUT]->(t)`,
    { rows: signals }
  );

  // Signal-evidence links
  if (links.length) {
    await cypher(
      `UNWIND $rows AS r
       MATCH (s:Signal {id: r.signal_id})
       MATCH (e:Evidence {id: r.evidence_id})
       MERGE (e)-[:SUPPORTS]->(s)`,
      { rows: links }
    );
  }

  return { evidence: evidence.length, signals: signals.length, links: links.length };
}

async function main() {
  if (!isGraphConfigured()) {
    console.error("Neo4j not configured. Set NEO4J_PASSWORD in .env.");
    process.exit(1);
  }

  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node scripts/sync-graph.mjs <context-id> | --all");
    process.exit(1);
  }

  console.log("Ensuring schema…");
  await ensureSchema();
  await loadTaxonomy();

  const db = getDb();
  const targets = arg === "--all"
    ? db.prepare("SELECT id FROM contexts").all().map(r => r.id)
    : [arg];

  for (const ctxId of targets) {
    process.stdout.write(`Syncing ${ctxId}… `);
    const r = await syncContext(ctxId);
    console.log(`${r.evidence} evidence, ${r.signals} signals, ${r.links} links`);
  }

  console.log("Done.");
}

main().catch(err => { console.error(err); process.exit(1); });
