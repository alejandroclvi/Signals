#!/usr/bin/env node
/**
 * Backfill evidence_state, sentiment, intent, and awareness_level
 * on evidence packets that were ingested before those columns existed.
 *
 * Usage: pnpm backfill
 */

import { getDb } from "../src/db/connection.mjs";
import {
  classifyEvidenceState,
  classifyIntent,
  classifyAwareness,
  classifySentiment,
} from "../src/pipeline/normalizer.mjs";

const db = getDb();

const nullState = db.prepare(
  `SELECT id, title, body FROM evidence_packets WHERE evidence_state IS NULL`
).all();

const nullSentiment = db.prepare(
  `SELECT id, title, body FROM evidence_packets WHERE sentiment IS NULL`
).all();

const nullIntent = db.prepare(
  `SELECT id, title, body FROM evidence_packets WHERE intent IS NULL`
).all();

const nullAwareness = db.prepare(
  `SELECT id, title, body FROM evidence_packets WHERE awareness_level IS NULL`
).all();

console.log(`Backfill targets:`);
console.log(`  evidence_state: ${nullState.length}`);
console.log(`  sentiment:      ${nullSentiment.length}`);
console.log(`  intent:         ${nullIntent.length}`);
console.log(`  awareness:      ${nullAwareness.length}`);

const updateState = db.prepare(
  `UPDATE evidence_packets SET evidence_state = ? WHERE id = ?`
);
const updateSentiment = db.prepare(
  `UPDATE evidence_packets SET sentiment = ? WHERE id = ?`
);
const updateIntent = db.prepare(
  `UPDATE evidence_packets SET intent = ? WHERE id = ?`
);
const updateAwareness = db.prepare(
  `UPDATE evidence_packets SET awareness_level = ? WHERE id = ?`
);

const run = db.transaction(() => {
  for (const p of nullState) {
    updateState.run(classifyEvidenceState(p.title, p.body), p.id);
  }
  for (const p of nullSentiment) {
    updateSentiment.run(classifySentiment(p.title, p.body), p.id);
  }
  for (const p of nullIntent) {
    updateIntent.run(classifyIntent(p.title, p.body), p.id);
  }
  for (const p of nullAwareness) {
    updateAwareness.run(classifyAwareness(p.title, p.body), p.id);
  }
});

run();

const total = nullState.length + nullSentiment.length + nullIntent.length + nullAwareness.length;
console.log(`\nBackfilled ${total} classifications.`);
