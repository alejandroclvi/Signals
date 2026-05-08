import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./connection.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "schema.sql");

// Ensure data directory exists
const dataDir = path.resolve(__dirname, "../../data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = getDb();
const schema = fs.readFileSync(schemaPath, "utf-8");
db.exec(schema);

// Safe column additions for existing databases
const safeAlter = (sql) => { try { db.exec(sql); } catch {} };
safeAlter("ALTER TABLE evidence_packets ADD COLUMN intent TEXT");
safeAlter("ALTER TABLE signals ADD COLUMN dominant_intent TEXT");
safeAlter("ALTER TABLE signals ADD COLUMN intent_mix TEXT");
safeAlter("ALTER TABLE signals ADD COLUMN alerted INTEGER DEFAULT 0");

// Phase 1: Awareness classification + evidence weighting
safeAlter("ALTER TABLE evidence_packets ADD COLUMN awareness_level TEXT");
safeAlter("ALTER TABLE evidence_packets ADD COLUMN evidence_weight REAL DEFAULT 1.0");
safeAlter("ALTER TABLE signals ADD COLUMN awareness_distribution TEXT");
safeAlter("ALTER TABLE signals ADD COLUMN dominant_awareness TEXT");

// Phase 2: Deep extraction — desire type, extractions, failed solutions
db.exec(`CREATE TABLE IF NOT EXISTS evidence_extractions (
  id              TEXT PRIMARY KEY,
  evidence_id     TEXT REFERENCES evidence_packets(id) ON DELETE CASCADE,
  extraction_type TEXT NOT NULL,
  surface_text    TEXT,
  deeper_text     TEXT,
  confidence      REAL,
  upvotes         INTEGER,
  created_at      TEXT DEFAULT (datetime('now'))
)`);
safeAlter("ALTER TABLE signals ADD COLUMN desire_type TEXT");
safeAlter("ALTER TABLE signals ADD COLUMN top_extractions TEXT");
safeAlter("ALTER TABLE signals ADD COLUMN failed_solutions TEXT");

// Phase 3: Pipeline stages + quality gates
db.exec(`CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              TEXT PRIMARY KEY,
  context_id      TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  started_at      TEXT DEFAULT (datetime('now')),
  completed_at    TEXT,
  stage_results   TEXT,
  quality_gates   TEXT,
  evidence_in     INTEGER,
  evidence_out    INTEGER,
  signals_produced INTEGER,
  status          TEXT DEFAULT 'running'
)`);
safeAlter("ALTER TABLE evidence_packets ADD COLUMN quality_score REAL");
safeAlter("ALTER TABLE evidence_packets ADD COLUMN pipeline_run_id TEXT");

// Context research methodology fields
safeAlter("ALTER TABLE contexts ADD COLUMN thesis TEXT");
safeAlter("ALTER TABLE contexts ADD COLUMN avatar TEXT");
safeAlter("ALTER TABLE contexts ADD COLUMN research_passes TEXT");
safeAlter("ALTER TABLE contexts ADD COLUMN grouping_mode TEXT"); // 'community' (default) or 'theme'

// Research briefs table (agent-generated)
db.exec(`CREATE TABLE IF NOT EXISTS research_briefs (
  id                TEXT PRIMARY KEY,
  context_id        TEXT REFERENCES contexts(id) ON DELETE SET NULL,
  mode              TEXT NOT NULL,  -- from_evidence | from_topic
  topic             TEXT NOT NULL,
  brief_content     TEXT NOT NULL,  -- full markdown output
  thesis            TEXT,
  avatar            TEXT,
  problem_language  TEXT,
  emotional_depth   TEXT,
  failed_solutions  TEXT,
  awareness_verdict TEXT,
  desire_type       TEXT,
  discovery_queries TEXT,
  evidence_count    INTEGER DEFAULT 0,
  community_count   INTEGER DEFAULT 0,
  model_used        TEXT,
  created_at        TEXT DEFAULT (datetime('now'))
)`);

// Thread intelligence tables
db.exec(`CREATE TABLE IF NOT EXISTS threads (
  id              TEXT PRIMARY KEY,
  context_id      TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  post_id         TEXT NOT NULL,
  community       TEXT,
  title           TEXT,
  url             TEXT,
  comment_count   INTEGER DEFAULT 0,
  total_score     INTEGER DEFAULT 0,
  weighted_evidence REAL DEFAULT 0,
  quality_tier    TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS thread_packets (
  thread_id       TEXT REFERENCES threads(id) ON DELETE CASCADE,
  evidence_id     TEXT REFERENCES evidence_packets(id) ON DELETE CASCADE,
  position        INTEGER DEFAULT 0,
  PRIMARY KEY (thread_id, evidence_id)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS thread_intelligence (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT REFERENCES threads(id) ON DELETE CASCADE,
  context_id      TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  pain_language       TEXT,
  emotional_depth     TEXT,
  not_x_its_y        TEXT,
  failed_solutions    TEXT,
  awareness_level     TEXT,
  avatar_clues        TEXT,
  desire_type         TEXT,
  conversation_arc    TEXT,
  signal_quality      TEXT,
  key_insight         TEXT,
  confidence_tier     TEXT,
  model_used          TEXT,
  tokens_used         INTEGER,
  processing_ms       INTEGER,
  created_at          TEXT DEFAULT (datetime('now'))
)`);
safeAlter("ALTER TABLE evidence_packets ADD COLUMN thread_id TEXT");
safeAlter("ALTER TABLE evidence_packets ADD COLUMN sentiment TEXT");
safeAlter("ALTER TABLE evidence_packets ADD COLUMN evidence_state TEXT");
safeAlter("ALTER TABLE thread_intelligence ADD COLUMN content_hash TEXT");

// Signal cases + reconciliation
db.exec(`CREATE TABLE IF NOT EXISTS signal_cases (
  id              TEXT PRIMARY KEY,
  context_id      TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT DEFAULT 'open',
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS signal_case_members (
  case_id         TEXT REFERENCES signal_cases(id) ON DELETE CASCADE,
  signal_id       TEXT REFERENCES signals(id) ON DELETE CASCADE,
  PRIMARY KEY (case_id, signal_id)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS extraction_reconciliation (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT REFERENCES threads(id) ON DELETE CASCADE,
  extraction_type TEXT,
  regex_found     INTEGER,
  llm_found       INTEGER,
  confidence_tier TEXT,
  surface_text    TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
)`);
// Signal vocabulary
db.exec(`CREATE TABLE IF NOT EXISTS signal_vocabulary (
  signal_id       TEXT REFERENCES signals(id) ON DELETE CASCADE,
  phrase          TEXT NOT NULL,
  category        TEXT NOT NULL,
  frequency       INTEGER DEFAULT 0,
  total_upvotes   INTEGER DEFAULT 0,
  example_quote   TEXT,
  example_url     TEXT,
  first_seen      TEXT,
  last_seen       TEXT,
  PRIMARY KEY (signal_id, phrase, category)
)`);

// Intelligence chain
db.exec(`CREATE TABLE IF NOT EXISTS intelligence_units (
  id                TEXT PRIMARY KEY,
  unit_type         TEXT NOT NULL,
  claim             TEXT NOT NULL,
  detail            TEXT,
  source_type       TEXT,
  source_id         TEXT,
  method            TEXT,
  parent_ids        TEXT,
  context_id        TEXT,
  signal_id         TEXT,
  community         TEXT,
  thread_id         TEXT,
  confidence        REAL DEFAULT 0.5,
  confidence_basis  TEXT,
  supporting_count  INTEGER DEFAULT 0,
  contradicting_count INTEGER DEFAULT 0,
  created_at        TEXT DEFAULT (datetime('now')),
  created_by        TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS intelligence_links (
  from_id   TEXT REFERENCES intelligence_units(id) ON DELETE CASCADE,
  to_id     TEXT REFERENCES intelligence_units(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL,
  weight    REAL DEFAULT 1.0,
  PRIMARY KEY (from_id, to_id)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS signal_facets (
  signal_id       TEXT REFERENCES signals(id) ON DELETE CASCADE,
  tag             TEXT NOT NULL,
  evidence_count  INTEGER DEFAULT 0,
  thread_count    INTEGER DEFAULT 0,
  total_upvotes   INTEGER DEFAULT 0,
  quotes          TEXT,
  not_x_its_y     TEXT,
  failed_solutions TEXT,
  avatar_clues    TEXT,
  awareness_level TEXT,
  summary         TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (signal_id, tag)
)`);
safeAlter("ALTER TABLE signals ADD COLUMN sentiment_distribution TEXT");
safeAlter("ALTER TABLE signals ADD COLUMN state_distribution TEXT");
safeAlter("ALTER TABLE signals ADD COLUMN dominant_state TEXT");
safeAlter("ALTER TABLE signals ADD COLUMN dominant_sentiment TEXT");
safeAlter("ALTER TABLE signals ADD COLUMN superseded_by TEXT");
safeAlter("ALTER TABLE signals ADD COLUMN case_id TEXT");
safeAlter("ALTER TABLE signals ADD COLUMN confidence_tier TEXT");

// Theme labels cache on contexts
safeAlter("ALTER TABLE contexts ADD COLUMN theme_labels TEXT");

// Agent mode: research, content, ads, competitive, product
safeAlter("ALTER TABLE contexts ADD COLUMN agent_mode TEXT");

// source_kind: explicit type for evidence packets (post, comment, market_prediction, market_price)
safeAlter("ALTER TABLE evidence_packets ADD COLUMN source_kind TEXT");

// Backfill source_kind from source_item_id prefix for existing data
db.exec(`
  UPDATE evidence_packets SET source_kind = 'comment'
  WHERE source_kind IS NULL AND source_item_id LIKE 't1_%'
`);
db.exec(`
  UPDATE evidence_packets SET source_kind = 'post'
  WHERE source_kind IS NULL AND source_item_id LIKE 't3_%'
`);
db.exec(`
  UPDATE evidence_packets SET source_kind = 'market_prediction'
  WHERE source_kind IS NULL AND source_item_id LIKE 'pm-%'
`);
db.exec(`
  UPDATE evidence_packets SET source_kind = 'market_price'
  WHERE source_kind IS NULL AND source_item_id LIKE 'stk-%'
`);

// Signal lifecycle: current trajectory state per signal.
// State machine: forming → emerging → fresh → mature → fading
//                       ↘ stalled (didn't progress) ↘ dormant (died)
db.exec(`CREATE TABLE IF NOT EXISTS signal_lifecycle (
  signal_id           TEXT PRIMARY KEY REFERENCES signals(id) ON DELETE CASCADE,
  context_id          TEXT NOT NULL,
  state               TEXT NOT NULL,           -- forming|emerging|fresh|mature|fading|stalled|dormant
  state_reason        TEXT,                    -- short human-readable why
  prev_state          TEXT,
  state_since         TEXT,                    -- when we entered this state
  materialized_at     TEXT,                    -- timestamp of forming/emerging → fresh transition
  evidence_total      INTEGER DEFAULT 0,
  evidence_30d        INTEGER DEFAULT 0,
  evidence_7d         INTEGER DEFAULT 0,
  evidence_prev_30d   INTEGER DEFAULT 0,       -- 30-60 days ago, for fading detection
  trend_ratio         REAL,                    -- evidence_30d / evidence_prev_30d
  latest_evidence_at  TEXT,
  research_attempts   INTEGER DEFAULT 0,
  last_research_at    TEXT,
  updated_at          TEXT DEFAULT (datetime('now'))
)`);

// Time-series of lifecycle snapshots — gives us the "timeline" view per signal
db.exec(`CREATE TABLE IF NOT EXISTS signal_lifecycle_snapshots (
  signal_id           TEXT NOT NULL,
  observed_at         TEXT NOT NULL,
  state               TEXT NOT NULL,
  evidence_total      INTEGER,
  evidence_30d        INTEGER,
  evidence_7d         INTEGER,
  trend_ratio         REAL,
  PRIMARY KEY (signal_id, observed_at)
)`);

// Per-lens materialized scores: same signal can rank differently per goal
db.exec(`CREATE TABLE IF NOT EXISTS signal_scores (
  signal_id    TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  lens         TEXT NOT NULL,
  total        REAL NOT NULL,
  components   TEXT NOT NULL,    -- JSON array of [name, weighted, raw, weight]
  rank_in_ctx  INTEGER,
  computed_at  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (signal_id, lens)
)`);

// Performance indexes for key join paths
const safeIndex = (sql) => { try { db.exec(sql); } catch {} };
safeIndex("CREATE INDEX IF NOT EXISTS idx_evidence_context ON evidence_packets(context_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_evidence_thread ON evidence_packets(thread_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_signal_evidence_signal ON signal_evidence(signal_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_signal_evidence_evidence ON signal_evidence(evidence_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_thread_packets_thread ON thread_packets(thread_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_thread_packets_evidence ON thread_packets(evidence_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_thread_intelligence_context ON thread_intelligence(context_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_thread_intelligence_thread ON thread_intelligence(thread_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_signals_context ON signals(context_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_intelligence_units_context ON intelligence_units(context_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_intelligence_units_signal ON intelligence_units(signal_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_intelligence_units_source ON intelligence_units(source_type, source_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_intelligence_links_to ON intelligence_links(to_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_signal_scores_lens_total ON signal_scores(lens, total DESC)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_signal_scores_signal ON signal_scores(signal_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_lifecycle_state ON signal_lifecycle(state)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_lifecycle_context ON signal_lifecycle(context_id)");
safeIndex("CREATE INDEX IF NOT EXISTS idx_lifecycle_snapshots_signal ON signal_lifecycle_snapshots(signal_id, observed_at DESC)");

// Seed evidence layers (static reference data)
const upsertLayer = db.prepare(
  "INSERT OR REPLACE INTO evidence_layers (id, label, note, sort_order) VALUES (?, ?, ?, ?)"
);

const layers = [
  ["conversation", "Conversation", "raw pain language, repeated complaints, community recurrence", 1],
  ["intent", "Intent", "active discovery, search demand, vendor comparison", 2],
  ["behavior", "Behavior", "build activity, usage traces, workflow artifacts", 3],
  ["expectation", "Expectation", "money-backed forecasts and probability repricing", 4],
  ["economic", "Economic commitment", "reviews, hiring, procurement, budget allocation", 5],
  ["capital", "Capital-market response", "public market price, volume, volatility, sector movement", 6],
  ["truth", "Primary truth", "official sources, filings, docs, vendor claims, fact checks", 7],
];

const seedLayers = db.transaction(() => {
  for (const [id, label, note, order] of layers) {
    upsertLayer.run(id, label, note, order);
  }
});

seedLayers();

console.log("Migration complete. Database ready at data/signals.db");
