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
