#!/usr/bin/env node
/**
 * Re-classify evidence and re-extract signals with noise filtering.
 * Usage: node scripts/re-extract.mjs --context market-blindness
 */
import "../src/db/migrate.mjs";
import { getDb } from "../src/db/connection.mjs";
import { classifyIntent, classifyAwareness } from "../src/pipeline/normalizer.mjs";
import { extractSignals } from "../src/pipeline/signal-extractor.mjs";
import { scoreSignal, confidenceFromScore } from "../src/pipeline/scorer.mjs";
import crypto from "node:crypto";

const contextId = process.argv.find((_, i, a) => a[i - 1] === "--context") || "market-blindness";
const db = getDb();

// Step 1: Re-classify all evidence with updated intent patterns
console.log("Re-classifying evidence...");
const allEvidence = db.prepare("SELECT * FROM evidence_packets WHERE context_id = ?").all(contextId);
const updateClassification = db.prepare("UPDATE evidence_packets SET intent = ?, awareness_level = ? WHERE id = ?");
db.transaction(() => {
  for (const ep of allEvidence) {
    updateClassification.run(
      classifyIntent(ep.title, ep.body),
      classifyAwareness(ep.title, ep.body),
      ep.id
    );
  }
})();
console.log("  Re-classified " + allEvidence.length + " packets");

// Step 2: Filter noise communities
// Filter communities that have nothing to do with business/tech/marketing
const noisePattern = /^r\/(FanFiction|AO3|Genshin_Impact|residentevil|boardgames|WorldOfWarships|DotA2|LegendsOfRuneterra|aromantic|datingoverthirty|BreakUps|thebachelor|InfertilityBabies|AmItheAsshole|AITAH|mildlyinfuriating|askmath|math|Sat|SnapchatHelp|Instagram|GetMotivated|DecidingToBeBetter|simpleliving|infj|intj|nba|nfl|BestofRedditorUpdates|HobbyDrama|SubredditDrama|GME|HFY|TwoXChromosomes|ArcRaiders|SteamDeck|SBCGaming|stocks|StockMarket|Bogleheads|wallstreetbets|ETFs|Daytrading|Trading|ValueInvesting|investing|RealEstate|careerguidance|careeradvice|jobs|antiwork|retailhell|cscareerquestions|ArtificialSentience|ChatGPTPromptGenius|ChatGPTPro|ChatGPT|dataisbeautiful|decadeology|Futurology|singularity|pwnhub)$/i;

const freshEvidence = db.prepare("SELECT * FROM evidence_packets WHERE context_id = ?").all(contextId)
  .filter(ep => !noisePattern.test(ep.community));
const noiseRemoved = allEvidence.length - freshEvidence.length;
console.log("  Filtered: " + allEvidence.length + " → " + freshEvidence.length + " (" + noiseRemoved + " noise removed)");

// Step 3: Re-extract signals
console.log("Extracting signals from " + freshEvidence.length + " relevant packets...");
const { signals, signalEvidence } = extractSignals(freshEvidence, contextId);

// Step 4: Score
for (const signal of signals) {
  const packetIds = signalEvidence.get(signal.id) || [];
  const packets = freshEvidence.filter(ep => packetIds.includes(ep.id));
  const { components, total } = scoreSignal(signal, packets);
  signal.confidence = confidenceFromScore(total);
  signal._scoreComponents = components;
  signal._scoreTotal = total;
}

// Filter below noise floor + re-rank
const validSignals = signals.filter(s => s._scoreTotal >= 150);
validSignals.sort((a, b) => b._scoreTotal - a._scoreTotal);
validSignals.forEach((s, i) => { s.rank = i + 1; });

// Step 5: Write signals
db.transaction(() => {
  const oldSignals = db.prepare("SELECT id FROM signals WHERE context_id = ?").all(contextId);
  for (const old of oldSignals) {
    db.prepare("DELETE FROM signal_related WHERE signal_id = ?").run(old.id);
    db.prepare("DELETE FROM signal_spread WHERE signal_id = ?").run(old.id);
    db.prepare("DELETE FROM signal_phrases WHERE signal_id = ?").run(old.id);
    db.prepare("DELETE FROM signal_evidence WHERE signal_id = ?").run(old.id);
    db.prepare("DELETE FROM scoring_runs WHERE signal_id = ?").run(old.id);
  }
  db.prepare("DELETE FROM signals WHERE context_id = ?").run(contextId);
  db.prepare("DELETE FROM evidence_extractions WHERE evidence_id IN (SELECT id FROM evidence_packets WHERE context_id = ?)").run(contextId);

  const insertSignal = db.prepare(
    `INSERT OR REPLACE INTO signals (id, context_id, rank, status, title, growth, tags, summary, communities, mentions, comments, confidence, volume, why, suggested_title, suggested_sub, next_source, dominant_intent, intent_mix, awareness_distribution, dominant_awareness, desire_type, top_extractions, failed_solutions, bubble_x, bubble_y, bubble_r) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSE = db.prepare("INSERT OR REPLACE INTO signal_evidence (signal_id, evidence_id) VALUES (?, ?)");
  const insertPhrase = db.prepare("INSERT INTO signal_phrases (signal_id, phrase, count) VALUES (?, ?, ?)");
  const insertSpread = db.prepare("INSERT INTO signal_spread (signal_id, community, percentage) VALUES (?, ?, ?)");
  const insertScoringRun = db.prepare("INSERT INTO scoring_runs (id, signal_id, components, total) VALUES (?, ?, ?, ?)");
  const insertExtraction = db.prepare("INSERT OR IGNORE INTO evidence_extractions (id, evidence_id, extraction_type, surface_text, deeper_text, confidence, upvotes) VALUES (?, ?, ?, ?, ?, ?, ?)");

  for (const signal of validSignals) {
    insertSignal.run(signal.id, signal.context_id, signal.rank, signal.status, signal.title, signal.growth, signal.tags, signal.summary, signal.communities, signal.mentions, signal.comments, signal.confidence, signal.volume, signal.why, signal.suggested_title, signal.suggested_sub, signal.next_source, signal.dominant_intent || "insight", signal.intent_mix || "{}", signal.awareness_distribution || "{}", signal.dominant_awareness || "problem_aware", signal.desire_type || null, signal.top_extractions || "[]", signal.failed_solutions || "[]", signal.bubble_x, signal.bubble_y, signal.bubble_r);
    for (const eid of (signalEvidence.get(signal.id) || [])) insertSE.run(signal.id, eid);
    if (signal._phrases) for (const [p, c] of signal._phrases) insertPhrase.run(signal.id, p, c);
    if (signal._spread) for (const [c, pct] of signal._spread) insertSpread.run(signal.id, c, pct);
    if (signal._scoreComponents) insertScoringRun.run(crypto.randomUUID(), signal.id, JSON.stringify(signal._scoreComponents), signal._scoreTotal);
    if (signal._deepExtractions) for (const ext of signal._deepExtractions) insertExtraction.run(ext.id, ext.evidence_id, ext.extraction_type, ext.surface_text, ext.deeper_text, ext.confidence, ext.upvotes);
  }
})();

// Summary
console.log("\n" + "=".repeat(50));
console.log(validSignals.length + " signals");

const intentDist = {};
freshEvidence.forEach(ep => { intentDist[ep.intent] = (intentDist[ep.intent] || 0) + 1; });
console.log("Intents: " + Object.entries(intentDist).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + "=" + v).join(", "));

console.log("\nSignals:");
validSignals.forEach(s => console.log("  #" + s.rank + " " + s.title.slice(0, 55) + " (" + s.mentions + " ev, " + s.dominant_intent + ", " + (s.desire_type || "?") + ")"));

const comms = {};
freshEvidence.forEach(ep => { comms[ep.community] = (comms[ep.community] || 0) + 1; });
console.log("\nTop communities:");
Object.entries(comms).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([c, n]) => console.log("  " + c + ": " + n));
