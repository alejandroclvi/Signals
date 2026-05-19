/**
 * Re-fetch a single Reddit thread from its surviving hints.
 *
 * Used when a thread row was deleted (e.g. seed wipe) but downstream
 * intelligence_units survived. The thread_id encodes the Reddit post id
 * (`thread:<post_id>` is the convention), so we can re-pull the post + its
 * top comments and rehydrate the `threads`, `thread_packets`, and
 * `evidence_packets` tables.
 *
 * Returns { ok, packets, thread } on success, or { ok: false, error, hint }
 * on failure.
 */

import { getDb } from "../db/connection.mjs";
import { normalizeRedditPost, normalizeRedditComment } from "./normalizer.mjs";
import { reconstructThreads, storeThreads } from "./thread-reconstructor.mjs";

const DEFAULT_COMMENT_LIMIT = 15;

function inferRedditPostId(threadId) {
  // Accept "thread:<post_id>" (current convention) or bare post id.
  if (!threadId) return null;
  if (threadId.startsWith("thread:")) return threadId.slice("thread:".length);
  return threadId;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "SignalsLocalPoC/0.1 (regen)" },
  });
  if (!res.ok) {
    const e = new Error(`Reddit ${res.status} ${res.statusText} fetching ${url}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export async function regenerateThread({ threadId, contextId, commentLimit = DEFAULT_COMMENT_LIMIT } = {}) {
  if (!threadId) return { ok: false, error: "threadId required" };

  const db = getDb();

  // Infer the context from any surviving intelligence_unit if not provided.
  if (!contextId) {
    const hint = db.prepare(
      "SELECT context_id FROM intelligence_units WHERE thread_id = ? AND context_id IS NOT NULL LIMIT 1"
    ).get(threadId);
    contextId = hint?.context_id;
  }
  if (!contextId) {
    return { ok: false, error: "Could not infer context for thread", hint: "Pass contextId in the request body." };
  }

  // Guard: the surviving intelligence_units may reference a context that no
  // longer exists (e.g. wiped by an unguarded seed run). Detect this BEFORE
  // we attempt inserts so the FK constraint doesn't fire with a cryptic
  // message — and so the operator gets a concrete fix.
  const ctxExists = db.prepare("SELECT id FROM contexts WHERE id = ?").get(contextId);
  if (!ctxExists) {
    return {
      ok: false,
      error: `Context "${contextId}" no longer exists in the database.`,
      hint: `The surviving intelligence_unit references a wiped context. Recreate it (e.g. \`node scripts/seed-discovery-contexts.mjs\`), then retry. See docs/runbooks/2026-05-19-seed-wipe-incident.md.`,
      missing_context: contextId,
    };
  }

  const postId = inferRedditPostId(threadId);
  if (!postId) return { ok: false, error: "thread_id does not look like a Reddit post id" };

  // Re-fetch from Reddit.
  const url = `https://www.reddit.com/comments/${encodeURIComponent(postId)}.json?raw_json=1&limit=${commentLimit}&depth=1`;
  let json;
  try {
    json = await fetchJson(url);
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      hint: err.status === 404
        ? "The Reddit post may have been deleted by its author or moderators."
        : "Network error — try again in a few seconds.",
    };
  }

  const postData = json?.[0]?.data?.children?.[0]?.data;
  if (!postData) {
    return { ok: false, error: "Reddit returned no post data for this id." };
  }

  // Build packets
  const postPacket = normalizeRedditPost(postData, contextId);
  // Honour the existing thread_id convention so reconstructThreads links them.
  postPacket.thread_id = threadId;

  const commentPackets = (json?.[1]?.data?.children || [])
    .filter(c => c.kind === "t1" && c.data.body)
    .slice(0, commentLimit)
    .map(c => {
      const packet = normalizeRedditComment({
        ...c.data,
        _post_permalink: postData.permalink,
        link_title: postData.title || "",
      }, contextId);
      packet.thread_id = threadId;
      return packet;
    });

  const packets = [postPacket, ...commentPackets].filter(p => (p.body || "").trim().length >= 20);

  // Insert. Idempotent via INSERT OR IGNORE on the primary key.
  const insert = db.prepare(`
    INSERT OR IGNORE INTO evidence_packets
      (id, context_id, source_id, source_layer, source_item_id, url, title, body,
       author_ref, community, observed_at, published_at, metrics, topics, raw_ref, content_hash,
       intent, awareness_level, evidence_weight, quality_score, thread_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  db.transaction(() => {
    for (const ep of packets) {
      const r = insert.run(
        ep.id, ep.context_id, ep.source_id, ep.source_layer, ep.source_item_id,
        ep.url, ep.title, ep.body, ep.author_ref, ep.community,
        ep.observed_at, ep.published_at, ep.metrics, ep.topics, ep.raw_ref, ep.content_hash,
        ep.intent || "question", ep.awareness_level || "problem_aware", ep.evidence_weight || 1.0,
        null, ep.thread_id
      );
      if (r.changes > 0) inserted++;
    }
  })();

  // Rebuild + persist threads for the context (covers this thread + any others
  // whose packets exist but rows don't). This is the supported path.
  try {
    const threads = reconstructThreads(contextId);
    storeThreads(threads);
  } catch (err) {
    return { ok: false, error: `Re-ingested ${inserted} packets but thread reconstruction failed: ${err.message}` };
  }

  const thread = db.prepare("SELECT * FROM threads WHERE id = ?").get(threadId);

  return {
    ok: true,
    inserted,
    total_packets: packets.length,
    thread: thread || null,
    hint: thread ? null : "Packets inserted but no thread row materialized — reconstructor may have grouped them differently.",
  };
}
