# Signals — for agents

> Operating manual for coding and research agents. Precise file paths, table names, conventions, and where to add things without breaking the pipeline. Read this *before* writing code.

## Thesis

Signals is an **early-warning system for internet momentum**. It detects behavior changes (not mention counts) across independent sources and surfaces them as claims backed by clickable evidence.

**It is not generic social listening.** If a change would make Signals look like a sentiment dashboard, an influencer ranker, or a trending-keywords widget, that change is wrong.

The non-negotiables:

- **Evidence-first.** Every claim must dereference to a packet, thread, or unit ID.
- **Independence > volume.** One Reddit thread + a rising search trend + a GitHub PR > ten upvoted Reddit posts in related subs.
- **Transparent scoring.** Every score is decomposed into named components. No black boxes.
- **Missing evidence is evidence.** When a layer is empty, surface it, don't hide it.
- **Discovery and corroboration are separate.** Don't blend them.

If you're a research agent: cite every claim with `[ev:<packet-id>]`, `[th:<thread-id>]`, `[sig:<signal-id>]`, or `[uni:<unified-id>]`. The dashboard renderer can hyperlink these tokens.

## Data ladder

```
Producer Output → Evidence Packet → Thread → Signal → Unified Signal (cross-source thesis)
   src/pipeline/    evidence_packets   threads   signals   unified_signals
   producers/*                         thread_   signal_   unified_signal_
                                       packets   evidence  evidence
```

Plus the cross-cutting structures:

```
signal_lifecycle   — current stage per signal
signal_cases       — cross-community groups (with signal_case_members)
signal_facets      — per-tag evidence rollups
signal_vocabulary  — per-category language used in evidence
signal_scores      — per-lens (goal) materialized rankings
intelligence_units / intelligence_links — append-only audit trail of LLM/agent findings
```

## Tables you'll actually query (≈14 of them)

| Table | Purpose | Key columns |
|---|---|---|
| `contexts` | Topics being watched | `id, label, queries, agent_mode, theme_labels` |
| `evidence_packets` | Every observation | `id, context_id, source_id, source_kind, source_layer, thread_id, intent, evidence_state, quality_score` |
| `threads` | Reconstructed Reddit threads | `id, context_id, post_id, community, total_score, quality_tier` |
| `thread_packets` | M2M between threads and packets | `thread_id, evidence_id, position` |
| `thread_intelligence` | LLM read of a thread | `thread_id, key_insight, pain_language, not_x_its_y, failed_solutions, signal_quality` |
| `signals` | Community-grouped claims | `id, context_id, title, rank, communities, dominant_state, case_id` |
| `signal_evidence` | Signal ↔ packet links | `signal_id, evidence_id` |
| `signal_lifecycle` | One row per signal, stage tracking | `signal_id, state, state_reason, evidence_7d/30d, trend_ratio` |
| `signal_cases` + `signal_case_members` | Cross-community groups | `case_id, signal_id` |
| `signal_facets` | Per-tag aggregations | `signal_id, tag, quotes, not_x_its_y, failed_solutions` |
| `signal_scores` | Per-lens rankings | `signal_id, lens, total, components, rank_in_ctx` |
| `unified_signals` | Cross-source theses | `id, context_id, topic, thesis, temporal_state, corroboration_score, layer_coverage, missing_evidence, recommended_actions` |
| `unified_signal_evidence` | Thesis ↔ packet ↔ layer | `unified_signal_id, evidence_id, layer, relevance` |
| `intelligence_units` / `intelligence_links` | Append-only audit trail of findings | `unit_type, claim, source_type, source_id, parent_ids, confidence_basis` |

Always go through these tables, not through grep on the source files, when you want to know what state the system is in.

## Commands

### Happy path (do these first)

```bash
pnpm setup            # install + migrate + seed
pnpm doctor           # env + port + Neo4j checks
pnpm dev              # http://localhost:3000
pnpm test:smoke       # 100+ data integrity checks (drilldown chain assertions included)
pnpm refresh <ctx>    # ingest + link + score + unify + brief for a context
```

### Power-user (legacy single-step commands, kept for surgical work)

```bash
pnpm ingest                                       # Reddit ingest
pnpm ingest:multi                                 # multi-producer ingest
pnpm research <ctx>                               # 3-round adaptive research loop
pnpm thread-intel --context <ctx>                 # LLM read of qualifying threads
pnpm brief --context <ctx>                        # markdown research brief
pnpm flow run unify-signals --context <ctx>       # cross-source theses
pnpm flow run weekly-cadence --context <ctx>      # full weekly pipeline
pnpm flow list                                    # all available flows
pnpm reclassify <ctx>                             # LLM re-classify packets
pnpm theme-labels <ctx>                           # regenerate theme labels
pnpm graph:sync                                   # mirror to Neo4j (optional)
```

### Health

```bash
pnpm test:smoke       # assert DB integrity + drilldown chain end-to-end
```

If smoke fails, **do not patch around the failure**. Read what failed (it's named), find the root cause. The smoke test names map 1:1 to claims the operator should be able to make about the data.

## Flow system

Flows live in **`flows/<name>.mjs`** (top-level — the runner reads this directory, not `src/flows/`). Each flow exports:

```js
export default {
  name: "unify-signals",
  description: "...",
  inputs: { context: { required: true }, asOf: { default: () => ... } },
  steps: [
    { name: "discover-topics", js: "src/flows/steps/discover-topics.mjs", args: { context: "${context}" }, capture: "discovery" },
    { name: "synthesize", js: "src/flows/steps/synthesize-topic.mjs", args: { byTopic: "${discovery.byTopic}" }, capture: "synth" },
    ...
  ],
};
```

Step kinds (one per step):
- `js: "path/to/step.mjs"` — calls the default export of a Node module with the interpolated args
- `bash: "command"` — runs shell with interpolated string
- `file: { read: "path" }` / `file: { write: "path", content: "..." }` — file I/O
- `mcp: { server: "x", tool: "y", args: {...} }` — MCP call

Variable interpolation: `${var}` returns the raw scope value; `"prefix ${var}"` does string substitution; recursive into objects/arrays.

Runner: `src/flows/runner.mjs`. Connectors: `src/flows/connectors/*.mjs`.

Steps: **`src/flows/steps/<name>.mjs`**. Each step is a default-exported async function `({arg1, arg2}) => returnValue`. The return value is captured under the step's `capture` key into scope.

To add a new flow:
1. Write the step(s) in `src/flows/steps/`.
2. Wire them in a new `flows/<name>.mjs`.
3. Run with `pnpm flow run <name> --context <ctx>`.

To inspect a captured value mid-flow: add `{ name: "debug", js: "src/flows/steps/...", args: { x: "${capture.field}" } }` and read the printed `→` line in the runner output.

## Source producers

Producers live in **`src/pipeline/producers/`** and are registered in `src/pipeline/producers/registry.mjs`. There are 10 today (Reddit, HackerNews, Polymarket, GitHub, Google, Anthropic releases, HN hiring, Yahoo Finance, Stocktwits, Reddit Finance).

Producer contract:

```js
export const myProducer = {
  id: "my-producer",
  layer: "conversation",      // one of the 7 evidence_layers
  kind: "search",             // 'search' takes queries; 'snapshot' takes nothing
  async search({ contextId, queries, afterDate, beforeDate, ... }) {
    // ... fetch + normalize ...
    return [/* evidence_packets-shaped rows */];
  },
};
```

Then add to `registry.mjs`:

```js
import { myProducer } from "./my-producer.mjs";
export const PRODUCERS = { ..., "my-producer": myProducer };
```

Then add a **source node** in the seed for any context that should use it.

Every packet a producer emits **must** have:
- `id` (stable, idempotent — include `source_id` + provider's id)
- `context_id`
- `source_id` (matches the producer id)
- `source_layer` (matches the producer's layer)
- `source_kind` (post, comment, market_prediction, market_price, search_result, repo, pr, issue, release_note, article, equity_quote, trader_message, hiring_post)
- `published_at` (ISO timestamp)
- `body` (>= 20 chars or it'll fail smoke)

## Evidence layers (the 7-layer ladder)

| Layer id | Label | Producer ids |
|---|---|---|
| `conversation` | Conversation | `reddit`, `hackernews` |
| `intent` | Intent (search) | `google` |
| `behavior` | Behavior (building) | `github` |
| `expectation` | Expectation (forecasts) | `polymarket` |
| `economic` | Economic commitment | `hn-hiring` |
| `capital` | Capital-market response | `yfinance`, `stocktwits`, `reddit-finance` |
| `truth` | Primary truth | `anthropic` (vendor releases) |

`evidence_layers` (seeded by `src/db/migrate.mjs`) is the authoritative list. If you add a new layer, update both the table seed and the producer registry.

## Dashboard routes & APIs

### HTML pages

| Route | View | Purpose |
|---|---|---|
| `/` | `layout.ejs` (with all partials) | Radar / detail-pane / control plane for the active context |
| `/evidence` | `evidence.ejs` | Packet library with thread/flat toggle |
| `/watchlist` | `watchlist.ejs` | Saved + dismissed signals |
| `/communities` | `communities.ejs` | Community evidence/signal counts |
| `/lens/:name` | `lens.ejs` | Per-goal (`ads`, `capital`, `competitive`, `content`, `product`, `research`) signal ranking |

### Read APIs (mostly safe to call from agents)

| Method + path | Returns |
|---|---|
| `GET /api/contexts` | List of contexts |
| `GET /api/contexts/:id/radar` | Full radar payload (signals, metrics, timeline, heatmap, intent, source nodes) |
| `GET /api/signals/:id` | Legacy signal detail (kept for compat) |
| `GET /api/signals/:id/chain-full` | **Preferred.** Signal + lifecycle + cases + unified signals + 7-layer coverage + missing notes + intelligence chain |
| `GET /api/signals/:id/chain` | Intelligence units organised by level |
| `GET /api/signals/:id/intelligence` | Aggregated thread intelligence for the signal |
| `GET /api/signals/:id/unified` | Cross-source theses this signal participates in |
| `GET /api/evidence` | Paginated packets with filtering |
| `GET /api/evidence/:id` | Packet + thread + sibling packets + citing signals + parent unified signals |
| `GET /api/threads/:id` | Thread + ordered packets + intelligence + citing signals |
| `GET /api/contexts/:id/unified-signals` | Cross-source theses for a context |
| `GET /api/unified-signals/:id` | Full thesis with per-layer evidence + missing + actions + linked signals |
| `GET /api/contexts/:id/cases` | Cross-community groups |
| `GET /api/cases/:id` | Group + members + per-tag overlap |
| `GET /api/contexts/:id/intelligence` | Context-level intelligence summary |
| `GET /api/contexts/:id/coverage` | Research coverage assessment |
| `GET /api/agent-modes` | Available agent modes/lenses |
| `GET /api/pipeline-runs` | Pipeline run history |
| `GET /api/stats` | Top-level counts |

### Write / mutation APIs (use with caution)

| Method + path | Effect |
|---|---|
| `POST /api/signals/:id/save` | Toggle `saved`, creates a `conclusion` intelligence unit |
| `POST /api/signals/:id/dismiss` | Toggle `dismissed`, creates a low-confidence `conclusion` unit |
| `POST /api/signals/:id/alert` | Toggle `alerted` |
| `POST /api/source-nodes/:id/toggle` | Toggle producer on/off for a context |
| `POST /api/contexts` | Create context (manual fields) |
| `POST /api/contexts/from-topic` | Create context from a topic string via LLM |
| `DELETE /api/contexts/:id` | Cascade-delete a context and all its data |
| `POST /api/ingest/reddit` | Run Reddit ingest |
| `POST /api/contexts/:id/discover` | Google → discovery → ingest |
| `POST /api/contexts/:id/deepen` | Targeted deepening by `evidence_state` |
| `POST /api/contexts/:id/thread-intel` | Analyze qualifying threads |
| `POST /api/signals/:id/analyze` | Analyze threads for one signal |
| `POST /api/contexts/:id/brief` | Generate brief (markdown) |
| `POST /api/contexts/:id/reclassify` | LLM reclassify packets |
| `POST /api/contexts/:id/theme-labels` | Regenerate theme labels |
| `POST /api/contexts/:id/research-round` | One adaptive research round |
| `POST /api/contexts/:id/research-loop` | Multi-round adaptive loop |

### SSE (dashboard push)

| Method + path | Effect |
|---|---|
| `GET /api/events` | EventSource stream (`toast`, `report`, `reload` events) |
| `POST /api/toast` | Broadcast a toast notification |
| `POST /api/report` | Broadcast a markdown modal |
| `POST /api/reload` | Trigger a dashboard reload |

## Where to add things

| Change | Edit |
|---|---|
| New producer | `src/pipeline/producers/<name>.mjs` + register in `src/pipeline/producers/registry.mjs` + add a seeded `source_nodes` row for any context that should use it |
| New flow | `flows/<name>.mjs` + any new steps in `src/flows/steps/` |
| New pipeline stage | `src/pipeline/<name>.mjs` + wire into the relevant flow (don't bypass the runner) |
| New dashboard read API | `src/routes/api.mjs` — add a route, reuse `formatEvidencePacket`/`formatSignal`/`safeJson` helpers |
| New dashboard write API | Same file; wrap mutations in `db.transaction()` |
| New HTML page | `src/views/<name>.ejs` + route in `src/routes/pages.mjs` |
| New detail-pane section | `src/views/partials/detail-pane.ejs` (add a slot) + render in `src/public/app.js` (add a render function) + CSS in `src/public/style.css` |
| New scorer component | `src/pipeline/scorer.mjs` or `src/pipeline/graph-scorer.mjs` (graph-backed) — return a component, don't write a table directly |
| New lens | `src/pipeline/lens-scorer.mjs` (lens config) — scoring is materialized into `signal_scores` |
| New smoke check | `scripts/smoke-test.mjs` — keep the `check(label, condition, detail)` shape |
| New CLI script | `scripts/<name>.mjs` + add a `pnpm` script to `package.json` |
| New schema column | `src/db/schema.sql` + add an idempotent `safeAlter` in `src/db/migrate.mjs` (never raw-add without the safe-alter wrapper) |
| Edit UI copy | `src/views/partials/*.ejs` first; `src/public/app.js` for dynamic strings |

## Conventions

- **IDs.** Stable, prefixed. `live:<slug>` for runtime signals. `unified:<ctx>:<asOf>:<topic-slug>:<rand>` for unified signals. `thread:<reddit-post-id>` for threads. Packets use `<producer>:<external-id>`.
- **Citation tokens.** `[ev:<packet-id>]`, `[th:<thread-id>]`, `[sig:<signal-id>]`, `[uni:<unified-id>]`. Always include these in agent-generated text.
- **Foreign keys.** `pragma foreign_keys = ON` is enabled in `connection.mjs`. **Cascade is your problem.** Anything that references `signals(id)` will be deleted when a signal is deleted in a refresh.
- **Transactions.** Any multi-write path uses `db.transaction(() => {...})()`. See `src/pipeline/signal-cases.mjs` for the idempotent pattern (delete old → insert new in one tx).
- **JSON columns.** Read with the shared `safeJson(value, fallback)` helper, write with `JSON.stringify(...)`.
- **Idempotency.** Producers must emit deterministic packet IDs so re-ingest doesn't dupe. Flow steps must be safe to re-run.
- **No frontend framework.** Vanilla JS, plain EJS. If you need state, put it in the DOM via `data-*` attributes.
- **No charting library.** Charts are custom SVG.
- **Toasts.** `showToast(msg, isError)` in `app.js`. Reports go through SSE → `POST /api/report`.
- **CSS additions.** Append to `src/public/style.css`. Don't rewrite existing sections.

## How not to break the pipeline

These are the patterns that have caused real bugs. Avoid them.

1. **Editing `signals` rows without re-running `rebuildCases()`.** Cases will go stale.
2. **Inserting into `signal_case_members` without checking `signals(id)` exists.** `INSERT OR IGNORE` will silently drop the row.
3. **Adding a new evidence packet without `source_kind` or `source_layer`.** Smoke test will fail; the chain drilldown will show "—".
4. **Adding a route that returns evidence without going through `formatEvidencePacket`.** The frontend expects the exact shape (`id`, `quote`, `source_layer`, `evidence_state`, etc.).
5. **Computing a score in two places.** All scoring goes through `lens-scorer.mjs` → `signal_scores`.
6. **Bypassing the flow runner for multi-step work.** Use `flows/`. Don't write ad-hoc orchestration in `scripts/`.
7. **Adding LLM calls without a kill switch on missing `OPENROUTER_API_KEY`.** Detect and return early with a clear hint.
8. **Using a name that already exists in a partial.** The dashboard renderer queries DOM IDs (`#layerCoverage`, `#crossLayer`, `#unifiedList`). Don't reuse IDs.

## How to run smoke tests

```bash
pnpm test:smoke
```

Exit 0 = all pass. Exit 1 = at least one assertion failed. Each assertion is named — read the list and find the table or pipeline step the failure points to. `scripts/smoke-test.mjs` is the source of truth; it covers:

- Database integrity (open, migrations applied)
- Context integrity (every context has queries, source nodes)
- Evidence integrity (every packet has `source_kind`, body length, no irrelevant communities)
- Signal integrity (no orphan signals, no duplicate ranks)
- Source node coverage (every context has ≥3 nodes)
- Market context (the seeded `market-signals` fixture intact)
- Pipeline runs (no failed runs)
- **Drilldown chain**: for every context, `signal → evidence → thread` resolves; every `unified_signal` has ≥1 evidence packet; `signal_cases` membership is non-empty whenever case rows exist (catches G-17); no orphan intelligence units.

When you add a feature, add the smoke check too. It is the contract.

## How to create reports

The system generates several kinds of reports:

- **Research brief** (`pnpm brief --context <ctx>`) — markdown; one section per signal or topic.
- **Unified brief** (`pnpm flow run unify-signals --context <ctx>`) — markdown at `output/unified-<ctx>-<asOf>.md` with triage table + per-topic detail.
- **Weekly report** (`pnpm report:weekly`) — `output/weekly-*.md`.
- **Article drafts** (`pnpm flow run article-publish --context <ctx>` and friends) — `output/articles/...`.

To push a report into the dashboard:

```bash
curl -X POST localhost:3000/api/report \
  -H 'Content-Type: application/json' \
  -d '{"title":"Whatever","body":"## My findings\n[ev:packet-id] said X","format":"markdown"}'
```

Citation tokens in the body will be linked when the renderer supports them (see G-11 in `SIGNAL_AGENT_MVP_REPORT.md`).

## How to cite evidence in your output

Always cite. The format is:

- `[ev:<packet-id>]` for an evidence packet
- `[th:<thread-id>]` for a thread
- `[sig:<signal-id>]` for a community-grouped signal
- `[uni:<unified-id>]` for a cross-source thesis

Example sentence in a brief:

> Founders are switching from notion to obsidian for personal capture [ev:reddit:productivity:t1_abc] [ev:reddit:obsidian:t1_xyz], a pattern that also appears in the Building layer [ev:github:repo:obsidian-md/obsidian-clipper].

Resolve unknown ids via `GET /api/evidence/:id`, `GET /api/threads/:id`, `GET /api/signals/:id/chain-full`, `GET /api/unified-signals/:id`. If you can't cite, don't claim.

## When in doubt

- Check `FLOW_SIMPLIFICATION_REPORT.md` and `SIGNAL_AGENT_MVP_REPORT.md` for the catalogued gaps.
- Check `docs/UNIFIED_DATA_FLOW.md` for the canonical unified-signal pipeline.
- Check `PROJECT_BRIEF.md` for the long-form product thesis.
- Check `CLAUDE.md` for project-specific Claude-Code-only instructions.
- Read the smoke test — it tells you what *must* hold.
- Read the API handler before the SQL table — handlers encode the expected shape.

If your change can't be expressed without breaking one of the **Thesis** non-negotiables, it's the wrong change.
