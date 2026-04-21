/**
 * Ingest discovered Reddit threads — fetches threads + comments from
 * discovered-{contextId}.json and runs them through the pipeline.
 *
 * Reusable from both CLI and API.
 */

import { getDb } from "../db/connection.mjs";
import { normalizeRedditPost, normalizeRedditComment, classifyEvidenceState, classifySentiment } from "./normalizer.mjs";
import { extractSignals } from "./signal-extractor.mjs";
import { scoreSignal, confidenceFromScore } from "./scorer.mjs";
import { refreshSignals } from "./refresh-signals.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DELAY_MS = 1200;
const COMMENT_LIMIT = 15;

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "SignalsLocalPoC/0.1 by local-developer" },
    });
    if (response.ok) return response;
    if (response.status === 429 && attempt < retries) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "0", 10);
      const backoff = Math.max(retryAfter * 1000, DELAY_MS * Math.pow(2, attempt + 1));
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }
    throw new Error(`Reddit ${response.status}: ${url}`);
  }
}

/**
 * Ingest discovered threads for a context.
 *
 * @param {string} contextId
 * @param {object} options
 * @param {function} options.onProgress
 * @returns {Promise<{evidenceCount, signalCount, errors}>}
 */
export async function ingestDiscoveredThreads(contextId, options = {}) {
  const db = getDb();
  const { onProgress } = options;

  const discoveredPath = path.resolve("data", `discovered-${contextId}.json`);
  if (!fs.existsSync(discoveredPath)) {
    throw new Error("No discovered threads file: " + discoveredPath);
  }

  const discovered = JSON.parse(fs.readFileSync(discoveredPath, "utf-8"));
  if (!discovered.length) return { evidenceCount: 0, signalCount: 0, errors: 0 };

  // Existing evidence for resume
  const existingIds = new Set(
    db.prepare("SELECT id FROM evidence_packets WHERE context_id = ?").all(contextId).map(r => r.id)
  );

  const allPackets = [];
  let fetched = 0;
  let errors = 0;

  for (const thread of discovered) {
    try {
      let jsonUrl = thread.url.replace(/\/$/, "");
      if (!jsonUrl.endsWith(".json")) jsonUrl += ".json";
      jsonUrl += "?raw_json=1&limit=" + COMMENT_LIMIT + "&depth=1";

      const res = await fetchWithRetry(jsonUrl);
      const json = await res.json();

      const postData = json[0]?.data?.children?.[0]?.data;
      if (!postData) { errors++; continue; }

      postData._subreddit_query = thread.query;
      postData._subreddit_target = thread.subreddit;

      const postPacket = normalizeRedditPost(postData, contextId);
      if (!existingIds.has(postPacket.id)) {
        allPackets.push(postPacket);
      }

      const comments = (json[1]?.data?.children || [])
        .filter(c => c.kind === "t1" && c.data.body)
        .slice(0, COMMENT_LIMIT)
        .map(c => ({
          ...c.data,
          _post_permalink: postData.permalink,
          _topic: thread.query,
          link_title: postData.title || "",
        }));

      const seenHashes = new Set(allPackets.map(p => p.content_hash));
      for (const comment of comments) {
        const packet = normalizeRedditComment(comment, contextId);
        if (!seenHashes.has(packet.content_hash) && !existingIds.has(packet.id)) {
          seenHashes.add(packet.content_hash);
          allPackets.push(packet);
        }
      }

      fetched++;
      if (onProgress) onProgress({ fetched, total: discovered.length, packets: allPackets.length, errors });

      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (err) {
      errors++;
    }
  }

  if (!allPackets.length) return { evidenceCount: 0, signalCount: 0, errors };

  // Quality gate
  const filtered = allPackets.filter(ep => {
    if (!ep.body || ep.body.trim().length < 20) return false;
    if (ep.author_ref === "deleted_or_unknown") return false;
    return true;
  });

  // Write evidence with ALL columns including evidence_state and sentiment
  const insertEvidence = db.prepare(
    `INSERT OR IGNORE INTO evidence_packets
     (id, context_id, source_id, source_layer, source_item_id, url, title, body,
      author_ref, community, observed_at, published_at, metrics, topics, raw_ref, content_hash,
      intent, awareness_level, sentiment, evidence_state, evidence_weight, quality_score, pipeline_run_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  db.transaction(() => {
    for (const ep of filtered) {
      insertEvidence.run(
        ep.id, ep.context_id, ep.source_id, ep.source_layer, ep.source_item_id,
        ep.url, ep.title, ep.body, ep.author_ref, ep.community,
        ep.observed_at, ep.published_at, ep.metrics, ep.topics, ep.raw_ref, ep.content_hash,
        ep.intent || "question", ep.awareness_level || "problem_aware",
        ep.sentiment || "neutral", ep.evidence_state || "sharing_insight",
        ep.evidence_weight || 1.0, null, crypto.randomUUID()
      );
    }
  })();

  // Refresh signals (handles extraction, scoring, facets, vocabulary, intelligence chain)
  const result = refreshSignals(contextId);

  return { evidenceCount: filtered.length, signalCount: result.signalCount, errors };
}
