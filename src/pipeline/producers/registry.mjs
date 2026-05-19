/**
 * Producer registry — plug new sources in here.
 *
 * Each producer exports a default object with:
 *   { id, layer, kind: 'search'|'snapshot', search({contextId, queries, ...}) }
 */

import { hackernews } from "./hackernews.mjs";
import { polymarket } from "./polymarket.mjs";
import { reddit } from "./reddit.mjs";
import { github } from "./github.mjs";
import { google } from "./google.mjs";
import { anthropic } from "./anthropic.mjs";
import { hnHiring } from "./hn-hiring.mjs";
import { yfinance } from "./yfinance.mjs";
import { stocktwits } from "./stocktwits.mjs";
import { redditFinance } from "./reddit-finance.mjs";

export const PRODUCERS = {
  reddit,
  hackernews,
  polymarket,
  github,
  google,
  anthropic,
  "hn-hiring": hnHiring,
  yfinance,
  stocktwits,
  "reddit-finance": redditFinance,
};

export function getProducer(id) {
  const p = PRODUCERS[id];
  if (!p) throw new Error(`Unknown producer: ${id}`);
  return p;
}

export function listProducers() {
  return Object.values(PRODUCERS).map(p => ({ id: p.id, layer: p.layer, kind: p.kind }));
}
