/**
 * Producer registry — plug new sources in here.
 *
 * Each producer exports a default object with:
 *   { id, layer, kind: 'search'|'snapshot', search({contextId, queries, ...}) }
 */

import { hackernews } from "./hackernews.mjs";
import { polymarket } from "./polymarket.mjs";

export const PRODUCERS = {
  hackernews,
  polymarket,
};

export function getProducer(id) {
  const p = PRODUCERS[id];
  if (!p) throw new Error(`Unknown producer: ${id}`);
  return p;
}

export function listProducers() {
  return Object.values(PRODUCERS).map(p => ({ id: p.id, layer: p.layer, kind: p.kind }));
}
