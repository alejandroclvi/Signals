/**
 * Incremental signal-evidence linker.
 *
 * For evidence in a context that's not yet linked to any signal, find candidate
 * signals via keyword overlap on signal title prefixes. Insert signal_evidence
 * rows for confident matches. Preserves all existing links.
 *
 * Algorithm:
 *   1. Tokenize each signal's title prefix (before ":" — e.g., "Cost Management" from
 *      "Cost Management: claude code"), filtered through stopwords.
 *   2. Compute the context's "trivial domain tokens" — tokens that appear in
 *      ≥30% of signal titles (these signal nothing, e.g., "claude" everywhere).
 *   3. For each unlinked evidence, count distinct title-token matches against
 *      its body+title. A match must include at least one non-trivial token.
 *   4. Threshold: ≥ 2 distinct matches OR (≥ 1 match AND covers ≥ 50% of signal title tokens).
 *   5. Insert signal_evidence rows. An evidence packet may link to multiple signals.
 *
 * NOTE: Polymarket evidence is excluded by default — synthesized bodies don't
 * naturally fit signal titles, and we already use Polymarket via
 * extract-context-evidence in the cross-context lane.
 */

import { getDb } from "../db/connection.mjs";

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","for","in","on","with","by","my","your","our",
  "this","that","these","those","is","are","be","been","being","have","has","had",
  "do","does","did","will","would","can","could","should","was","were","but","not",
  "no","yes","ok","okay","also","just","too","more","less","many","much","very",
  "really","well","get","got","gets","getting","like","see","seen","from","into",
  "as","at","it","its","i","you","we","they","he","she","them","us","me","him","her",
  "all","any","some","one","two","three","new","other","first","last","best","most",
  "ever","still","yet","actually","probably","maybe","seems","seem","every","each",
  "any","what","when","where","why","how","which","who","whom","there","here",
]);

function tokenize(text) {
  if (!text) return new Set();
  const tokens = String(text)
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function titlePrefixTokens(title) {
  // Split on the first ":" — most signal titles are "Topic: claude code" form.
  const prefix = title.includes(":") ? title.split(":")[0] : title;
  return tokenize(prefix);
}

function computeTrivialTokens(signals) {
  // Tokens that appear in ≥30% of signal title prefixes are too generic to be
  // discriminating ("claude" appears in every Claude Code signal title).
  const counts = new Map();
  const N = signals.length;
  for (const s of signals) {
    for (const t of titlePrefixTokens(s.title)) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const trivial = new Set();
  for (const [t, c] of counts.entries()) {
    if (c / N >= 0.3) trivial.add(t);
  }
  return trivial;
}

/**
 * Run the linker for a context.
 *
 * Returns: { signalsConsidered, unlinkedConsidered, linksInserted, perSignal: {signal_id: count}, sample: [{ev_id, signal_id, matched_tokens}] }
 */
export function linkUnlinkedEvidence(contextId, options = {}) {
  const db = getDb();
  const minMatches = options.minMatches || 2;
  const minCoverage = options.minCoverage || 0.5;
  const excludeSources = options.excludeSources || ["polymarket"];
  const sampleLimit = options.sampleLimit || 8;

  const signals = db.prepare(`
    SELECT id, title FROM signals WHERE context_id = ?
  `).all(contextId);
  if (!signals.length) return { signalsConsidered: 0, unlinkedConsidered: 0, linksInserted: 0, perSignal: {}, sample: [] };

  const trivial = computeTrivialTokens(signals);
  const signalTokens = signals.map(s => {
    const all = titlePrefixTokens(s.title);
    const meaningful = new Set([...all].filter(t => !trivial.has(t)));
    return { id: s.id, title: s.title, allTokens: all, meaningfulTokens: meaningful };
  });

  // Pull unlinked evidence — minimal columns to avoid mass body retrieval if huge
  const placeholders = excludeSources.map(() => "?").join(",");
  const unlinked = db.prepare(`
    SELECT ep.id, ep.title, ep.body, ep.source_id, ep.community
    FROM evidence_packets ep
    WHERE ep.context_id = ?
      AND ep.id NOT IN (SELECT evidence_id FROM signal_evidence)
      ${excludeSources.length ? `AND ep.source_id NOT IN (${placeholders})` : ""}
  `).all(contextId, ...excludeSources);

  const insert = db.prepare(`INSERT OR IGNORE INTO signal_evidence (signal_id, evidence_id) VALUES (?, ?)`);

  let linksInserted = 0;
  const perSignal = {};
  const sample = [];

  const tx = db.transaction(() => {
    for (const ev of unlinked) {
      const haystack = `${ev.title || ""} ${ev.body || ""}`;
      const evTokens = tokenize(haystack);
      if (evTokens.size === 0) continue;

      for (const sig of signalTokens) {
        if (sig.allTokens.size === 0) continue;

        // Count matches against the FULL title-prefix tokens (so "cost management" matches both)
        const matched = [];
        let nonTrivialMatch = false;
        for (const t of sig.allTokens) {
          if (evTokens.has(t)) {
            matched.push(t);
            if (!trivial.has(t)) nonTrivialMatch = true;
          }
        }
        if (matched.length === 0 || !nonTrivialMatch) continue;

        const coverage = matched.length / sig.allTokens.size;
        const passes = matched.length >= minMatches || coverage >= minCoverage;
        if (!passes) continue;

        const r = insert.run(sig.id, ev.id);
        if (r.changes > 0) {
          linksInserted++;
          perSignal[sig.id] = (perSignal[sig.id] || 0) + 1;
          if (sample.length < sampleLimit) {
            sample.push({
              evidence_id: ev.id,
              signal_id: sig.id,
              signal_title: sig.title,
              source: ev.source_id,
              community: ev.community,
              matched_tokens: matched,
              coverage: Math.round(coverage * 100) / 100,
            });
          }
        }
      }
    }
  });
  tx();

  return {
    signalsConsidered: signals.length,
    unlinkedConsidered: unlinked.length,
    linksInserted,
    perSignal,
    sample,
    trivialTokens: [...trivial],
  };
}
