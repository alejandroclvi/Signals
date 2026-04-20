# Dashboard Replay Fixtures

Generated: 2026-04-19 15:47:00 EDT

This folder contains file-backed replay scenarios for the local Signal Radar dashboard.

## Why Script Fixtures

The dashboard is currently opened directly through `file://`, so JSON loaded with `fetch()` can fail in some browsers because of local-file restrictions.

For now, fixtures are plain JavaScript files that attach scenarios to:

```js
window.signalRadarFixtures
```

This keeps the prototype serverless while still moving data out of the one-off view.

## System Principle

```text
No evidence without provenance.
No provenance without drilldown.
No replay evidence pretending to be live source evidence.
```

Every fixture should preserve either a canonical source URL or a local replay/raw reference for each evidence packet.

## Active Fixture File

```text
reddit-category-pain-radar.fixture.js
```

Optional live output:

```text
reddit-live-search.fixture.js
```

Live pull config:

```text
reddit-live-search.config.json
```

## Fixture Shape

Each replay scenario should include:

```js
{
  id: "stable-fixture-id",
  label: "Human label",
  context: "Active context name",
  crumbs: "Radar / Segment",
  period: "last 30d",
  topicCount: 12,
  selectedId: "default-signal-id",
  metrics: [],
  timeline: {},
  heatmap: [],
  intent: [],
  evidencePackets: [],
  sourceNodes: [],
  otherBubbles: [],
  signals: []
}
```

## Evidence Packet Shape

Replay evidence should use the same shape the Reddit producer will eventually emit:

```js
{
  id: "reddit:signal-id:source-item-id",
  source_id: "reddit",
  source_layer: "conversation",
  source_kind: "post",
  source_item_id: "reddit_post_or_comment_id",
  url: "#",
  title: "Original or replay item title",
  body: "Representative source text",
  author_ref: "u/example_or_hash",
  community: "r/example",
  observed_at: "2026-04-19T15:30:00-04:00",
  published_at: "2026-04-18T15:30:00-04:00",
  metrics: {
    score: 100,
    comments: 20
  },
  topics: ["topic one", "topic two"],
  raw_ref: "replay://reddit/context/item-id"
}
```

For replay-only evidence, keep `url` as `"#"` unless the item is from an actual captured source URL. Do not invent public Reddit URLs.

Valid Reddit `source_kind` values for the local PoC:

- `post`
- `comment`

## Signal Shape

Each signal should include:

```js
{
  id: "stable-signal-id",
  rank: 1,
  status: "Emerging",
  title: "Signal title",
  growth: "+123%",
  tags: ["demand", "adoption"],
  summary: "Short explanation",
  communities: ["r/example"],
  mentions: 12,
  comments: 80,
  confidence: "High",
  x: 640,
  y: 120,
  r: 32,
  volume: 140,
  evidence: ["reddit:signal-id:source-item-id"],
  phrases: [],
  spread: [],
  related: [],
  why: "Why this matters",
  suggested: {
    title: "Suggested action",
    sub: "Action explanation"
  },
  next: "What source to enable next"
}
```

## Source Node Shape

Each source node should include:

```js
{
  id: "google-search",
  name: "Google Search",
  state: "available",
  layers: ["intent"],
  lift: 11,
  adds: "What this source contributes.",
  cannot: "What this source cannot prove."
}
```

Valid local states:

- `enabled`
- `available`
- `gated`

## Next Step

Move the default law-firm replay data out of `dashboard-prototype/index.html` and into this fixture folder.

Then split the live Reddit pull into:

```text
pull -> raw capture -> normalized evidence packets -> signal candidates
```
