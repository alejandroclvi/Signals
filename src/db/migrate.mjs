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
