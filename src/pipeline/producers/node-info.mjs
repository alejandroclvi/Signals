/**
 * Producer → source_node metadata.
 *
 * Single source of truth for the human-readable name + layer mapping used
 * when registering a `source_nodes` row for a producer. Both
 * `scripts/sync-source-nodes.mjs` and `scripts/ingest-multi.mjs` import this
 * so the registration stays consistent.
 *
 * Add a new producer here when you wire one into the registry.
 */

import { listProducers } from "./registry.mjs";

const DISPLAY_NAMES = {
  "reddit":          "Reddit",
  "hackernews":      "Hacker News",
  "google":          "Google Search",
  "github":          "GitHub",
  "polymarket":      "Polymarket",
  "hn-hiring":       "HN Who's Hiring",
  "yfinance":        "Yahoo Finance",
  "stocktwits":      "Stocktwits",
  "reddit-finance":  "Reddit (finance subs)",
  "anthropic":       "Anthropic releases",
};

// Legacy seed names occasionally seen in older `source_nodes` rows — kept
// here so a sync pass can still recognize them.
const LEGACY_NAMES = {
  "google-search":   { name: "Google Search",       layers: ["intent"] },
  "hacker-news":     { name: "Hacker News",         layers: ["conversation"] },
  "primary":         { name: "Primary sources",     layers: ["truth"] },
};

/**
 * Look up node info for a producer id. Returns `{ name, layers }` or null
 * if the producer isn't in the registry (and isn't a known legacy id).
 */
export function nodeInfoFor(producerId) {
  if (LEGACY_NAMES[producerId]) return LEGACY_NAMES[producerId];
  const producer = listProducers().find(p => p.id === producerId);
  if (!producer) return null;
  return {
    name:   DISPLAY_NAMES[producerId] || producerId,
    layers: [producer.layer],
  };
}

/**
 * Ensure a `source_nodes` row exists for (producerId, contextId). Returns
 * 'inserted' | 'updated' | 'skipped'. Caller passes a `db` handle and a
 * stats object summarizing what was written (used in `adds` column).
 */
export function ensureNodeForProducer(db, producerId, contextId, stats = {}) {
  const info = nodeInfoFor(producerId);
  if (!info) return "skipped";

  const nodeId = `${producerId}:${contextId}`;
  const existing = db.prepare("SELECT state FROM source_nodes WHERE id = ?").get(nodeId);
  if (existing) {
    if (existing.state !== "gated") {
      db.prepare("UPDATE source_nodes SET state = 'enabled' WHERE id = ?").run(nodeId);
    }
    return "updated";
  }

  const addsBlurb = stats.packets
    ? `${stats.packets} ${info.layers[0]}-layer observation${stats.packets === 1 ? "" : "s"}`
    : null;

  db.prepare(`
    INSERT INTO source_nodes (id, context_id, name, state, layers, lift, adds, cannot)
    VALUES (?, ?, ?, 'enabled', ?, ?, ?, ?)
  `).run(nodeId, contextId, info.name, JSON.stringify(info.layers), 0, addsBlurb, null);
  return "inserted";
}
