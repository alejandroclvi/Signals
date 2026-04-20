#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const defaultConfigPath = path.join(rootDir, "fixtures", "reddit-live-search.config.json");
const defaultOutputPath = path.join(rootDir, "fixtures", "reddit-live-search.fixture.js");

const configPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultConfigPath;
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : defaultOutputPath;

const config = JSON.parse(await readFile(configPath, "utf8"));
const observedAt = new Date().toISOString();
const limit = Math.max(1, Math.min(Number(config.limitPerQuery || 10), 25));
const sort = config.sort || "new";

function stableId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function hashAuthor(author) {
  if (!author || author === "[deleted]") return "deleted_or_unknown";
  return `sha256:${createHash("sha256").update(author).digest("hex").slice(0, 16)}`;
}

function redditSearchUrl(subreddit, query) {
  const url = new URL(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json`);
  url.searchParams.set("q", query);
  url.searchParams.set("restrict_sr", "1");
  url.searchParams.set("sort", sort);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("raw_json", "1");
  return url;
}

function normalizePost({ post, subreddit, query }) {
  const data = post.data || {};
  const sourceItemId = data.name || `t3_${data.id}`;
  const createdUtc = data.created_utc ? new Date(data.created_utc * 1000).toISOString() : observedAt;
  const permalink = data.permalink ? `https://www.reddit.com${data.permalink}` : "#";
  const body = [data.title, data.selftext].filter(Boolean).join("\n\n").slice(0, 1400);
  const queryId = stableId(query);

  return {
    id: `reddit:${queryId}:${sourceItemId}`,
    source_id: "reddit",
    source_layer: "conversation",
    source_kind: "post",
    source_item_id: sourceItemId,
    url: permalink,
    title: data.title || query,
    body,
    author_ref: hashAuthor(data.author),
    community: data.subreddit_name_prefixed || `r/${subreddit}`,
    observed_at: observedAt,
    published_at: createdUtc,
    metrics: {
      score: data.score ?? 0,
      comments: data.num_comments ?? 0,
      upvote_ratio: data.upvote_ratio ?? null
    },
    topics: [query],
    raw_ref: `raw://reddit/search/${subreddit}/${queryId}/${sourceItemId}`
  };
}

async function fetchListing(subreddit, query) {
  const url = redditSearchUrl(subreddit, query);
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "SignalsLocalPoC/0.1 by local-developer"
    }
  });

  if (!response.ok) {
    throw new Error(`Reddit search failed ${response.status} ${response.statusText}: ${url}`);
  }

  const json = await response.json();
  const children = json?.data?.children || [];
  return children.map((post) => normalizePost({ post, subreddit, query }));
}

function buildSignals(evidencePackets) {
  return config.queries.map((query, index) => {
    const queryId = stableId(query);
    const packets = evidencePackets
      .filter((packet) => packet.topics.includes(query))
      .sort((a, b) => (b.metrics.score + b.metrics.comments) - (a.metrics.score + a.metrics.comments))
      .slice(0, 4);

    const communities = [...new Set(packets.map((packet) => packet.community))];
    const comments = packets.reduce((sum, packet) => sum + (packet.metrics.comments || 0), 0);
    const score = packets.reduce((sum, packet) => sum + (packet.metrics.score || 0), 0);

    return {
      id: queryId,
      rank: index + 1,
      status: packets.length >= 3 ? "Emerging" : "Watch",
      title: query,
      growth: packets.length >= 3 ? "+ live" : "new",
      tags: ["demand"],
      summary: `Live Reddit search replay for "${query}" across configured subreddits.`,
      communities,
      mentions: packets.length,
      comments,
      confidence: packets.length >= 3 ? "Medium" : "Low",
      x: 620 - index * 28,
      y: 130 + index * 44,
      r: Math.max(18, Math.min(38, 18 + packets.length * 4)),
      volume: score + comments,
      evidence: packets.map((packet) => packet.id),
      phrases: [[query, packets.length]],
      spread: communities.map((community) => [
        community,
        Math.round((packets.filter((packet) => packet.community === community).length / Math.max(1, packets.length)) * 100)
      ]),
      related: [],
      why: "This signal was generated from a live Reddit search pull and should be treated as raw source evidence until scoring corroborates it.",
      suggested: {
        title: "Suggested action",
        sub: "Inspect the source packets, then enable search or behavior sources for corroboration."
      },
      next: "Enable Google Search next to test whether Reddit conversation evidence has active discovery intent."
    };
  }).filter((signal) => signal.evidence.length);
}

function buildFixture(evidencePackets) {
  const signals = buildSignals(evidencePackets);
  const communities = [...new Set(evidencePackets.map((packet) => packet.community))];
  const savedEvidence = String(evidencePackets.length);

  return {
    id: config.id || "reddit-live-search",
    label: config.label || "Reddit live search pull",
    context: config.context || "Reddit live pull",
    crumbs: config.crumbs || "Radar / Reddit live pull",
    period: config.period || "latest pull",
    topicCount: signals.length,
    selectedId: signals[0]?.id,
    metrics: [
      { title: "Emerging signals", value: String(signals.length), delta: "+live", caption: "from latest pull", spark: [1, 2, 3, signals.length] },
      { title: "High-confidence", value: "0", delta: "-", caption: "needs corroboration", spark: [0, 0, 0, 0] },
      { title: "Communities monitored", value: String(communities.length), delta: "-", caption: "from config", spark: [0, communities.length] },
      { title: "Saved evidence", value: savedEvidence, delta: "+live", caption: "normalized packets", spark: [0, evidencePackets.length] }
    ],
    timeline: {
      posts: signals.map((signal) => signal.mentions),
      comments: signals.map((signal) => signal.comments),
      authors: signals.map((signal) => signal.mentions)
    },
    heatmap: communities.slice(0, 5).map((community) => [
      community,
      signals.slice(0, 4).map((signal) => signal.evidence.filter((packetId) => {
        const packet = evidencePackets.find((item) => item.id === packetId);
        return packet?.community === community;
      }).length)
    ]),
    intent: [
      ["Tool search", 28, "#3e9558"],
      ["Frustration", 18, "#de5c56"],
      ["Adoption", 14, "#2d6fbb"],
      ["Comparison", 12, "#bd842f"]
    ],
    sourceNodes: [
      { id: "reddit", name: "Reddit", state: "enabled", layers: ["conversation"], lift: 0, adds: "Live Reddit search evidence from configured subreddits.", cannot: "Cannot prove buying intent, adoption, budget, or causality." },
      { id: "google-search", name: "Google Search", state: "available", layers: ["intent"], lift: 11, adds: "Active discovery and comparison intent.", cannot: "Cannot prove purchase or retention." },
      { id: "google-trends", name: "Google Trends", state: "gated", layers: ["intent"], lift: 8, adds: "Broad search-demand direction.", cannot: "Weak for very early small signals." },
      { id: "hacker-news", name: "Hacker News", state: "available", layers: ["conversation"], lift: 7, adds: "Builder debate and technical skepticism.", cannot: "Narrow audience, not broad demand." },
      { id: "github", name: "GitHub", state: "available", layers: ["behavior"], lift: 9, adds: "Implementation artifacts and developer adoption.", cannot: "Cannot prove buyer budget." },
      { id: "linkedin", name: "LinkedIn", state: "gated", layers: ["conversation", "economic"], lift: 8, adds: "Professional normalization and hiring signals.", cannot: "Access constraints limit full public coverage." },
      { id: "g2-jobs", name: "G2 / Jobs", state: "gated", layers: ["economic"], lift: 10, adds: "Buyer reviews, categories, and hiring commitment.", cannot: "Usually later than early pain signals." },
      { id: "polymarket", name: "Polymarket", state: "available", layers: ["expectation"], lift: 6, adds: "Money-backed probability movement.", cannot: "Not useful for every product-category question." },
      { id: "stocks", name: "Stock Prices", state: "available", layers: ["capital"], lift: 6, adds: "Capital-market response and divergence.", cannot: "Cannot prove causality by itself." },
      { id: "primary", name: "Primary Sources", state: "available", layers: ["truth"], lift: 10, adds: "Official confirmation, docs, claims, and filings.", cannot: "Often validates later than social discovery." }
    ],
    otherBubbles: [],
    evidencePackets,
    signals
  };
}

const evidencePackets = [];

for (const subreddit of config.subreddits || []) {
  for (const query of config.queries || []) {
    try {
      const packets = await fetchListing(subreddit, query);
      evidencePackets.push(...packets);
      console.error(`pulled ${packets.length} packets for r/${subreddit}: ${query}`);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } catch (error) {
      const cause = error.cause?.code ? ` (${error.cause.code})` : "";
      console.error(`${error.message}${cause}`);
    }
  }
}

if (!evidencePackets.length) {
  console.error("no evidence packets pulled; leaving existing fixture output untouched");
  process.exitCode = 2;
  process.exit();
}

// Deduplicate by source_item_id: merge topics, keep highest-engagement version
const deduped = [];
const seen = new Map();
for (const packet of evidencePackets) {
  const existing = seen.get(packet.source_item_id);
  if (existing) {
    for (const topic of packet.topics) {
      if (!existing.topics.includes(topic)) existing.topics.push(topic);
    }
    const existingScore = (existing.metrics.score || 0) + (existing.metrics.comments || 0);
    const newScore = (packet.metrics.score || 0) + (packet.metrics.comments || 0);
    if (newScore > existingScore) {
      existing.id = packet.id;
      existing.url = packet.url;
      existing.title = packet.title;
      existing.body = packet.body;
      existing.metrics = packet.metrics;
      existing.raw_ref = packet.raw_ref;
    }
  } else {
    const clone = { ...packet, topics: [...packet.topics] };
    seen.set(packet.source_item_id, clone);
    deduped.push(clone);
  }
}
const dupeCount = evidencePackets.length - deduped.length;
if (dupeCount) console.error(`deduped ${dupeCount} duplicate source items (${evidencePackets.length} → ${deduped.length})`);

const fixture = buildFixture(deduped);
const js = `window.signalRadarFixtures = window.signalRadarFixtures || [];\nwindow.signalRadarFixtures.push(${JSON.stringify(fixture, null, 2)});\n`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, js, "utf8");
console.error(`wrote ${outputPath}`);
