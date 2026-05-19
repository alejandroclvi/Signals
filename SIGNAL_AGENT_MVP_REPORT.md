# Signals MVP — Agent Operator Audit

> **Goal of the audit.** An operator opens the dashboard, picks a signal, and follows the chain: *signal → evidence packet → thread → corroborating layer → unified signal → action*. Every claim is backed by a packet ID. Every missing layer is visible. Every score is explainable.
>
> Today the database holds a richer model than the UI exposes. This report catalogues that gap.

## Snapshot of the live stack (2026-05-18)

| Layer | Table | Rows | Exposed by API? | Exposed by UI? |
|---|---|---:|---|---|
| Producers → Packets | `evidence_packets` | 23,061 | yes (`/api/evidence`, `/api/signals/:id`) | yes |
| Threads | `threads` / `thread_packets` | 1,511 / 11,804 | partial (`threadInsights` join on `/evidence` page) | partial (Evidence page only) |
| Thread intelligence | `thread_intelligence` | 194 | yes (`/api/signals/:id/intelligence`) | partial (sidebar list) |
| Signals (community-grouped) | `signals` + `signal_evidence` | 378 / 23,529 | yes | yes |
| Lens scoring | `signal_scores` | 901 (5 lenses × ~90 signals) | only via `/lens/:name` | only as full page |
| Lifecycle | `signal_lifecycle` / `_snapshots` | 111 / 134 | **NO** | **NO** |
| Cases (cross-community dedup) | `signal_cases` / `signal_case_members` | 76 / **0** ⚠ | **NO** | **NO** |
| Facets per tag | `signal_facets` | 578 | only inline in `formatSignal` | partial |
| Vocabulary | `signal_vocabulary` | 4,367 | only inline | partial |
| Intelligence chain | `intelligence_units` / `_links` | 2,180 / 4,000 | yes (`/api/signals/:id/chain`) | yes (chain card) |
| **Unified signals** (cross-layer thesis) | `unified_signals` / `_evidence` | **8 / 146** | **NO** | **NO** |
| Evidence layers (7-layer ladder) | `evidence_layers` | 7 | yes (radar payload) | yes (chip strip) |
| Source kinds (producer outputs) | `evidence_packets.source_kind` | 13 distinct kinds | partial filter | partial |

**The structural gap.** The right column has too many "NO". The data is there. The drilldown isn't.

---

## How to read this report

- **Issue ID** — referenced from `SIGNAL_AGENT_MVP_PATCH_PLAN.md`.
- **Classification** — 1 Evidence-chain · 2 Cross-layer link · 3 Unified-signal drilldown · 4 Coverage/explainability · 5 Conversation-to-market · 6 Insight/provenance · 7 Lifecycle · 8 Lens-ranking · 9 Grouping/comparison · 10 UI complexity · 11 Agent-action · 12 Test.
- **Severity** — P0 blocks the operator loop · P1 makes it brittle · P2 polish.
- **Least-resistance fix** — uses existing tables and the Express/EJS/vanilla stack. No new schemas. No frontend framework.

---

## Issues

### G-01 — Unified signals exist in DB but are invisible

| Field | Value |
|---|---|
| Route/surface | none (no route renders them) |
| Signal/entity | `unified_signals` (8 rows, all in `claude-code-news-radar`) |
| Current | `flows/unify-signals.mjs` writes `unified_signals` + `unified_signal_evidence` and dumps a markdown file to `output/unified-…md`. Nothing in `src/routes/api.mjs` or `src/views/*` queries the table. |
| Expected | Operator sees a "Unified Signals" section per context. Opening one shows the thesis, temporal state, layer-by-layer analysis, corroboration score, missing-evidence list, recommended actions, and a drilldown to each linked packet by layer. |
| Existing pattern | `unified_signal_evidence (unified_signal_id, evidence_id, layer, relevance)` already groups packets by layer. `layer_analysis`, `corroboration_score`, `missing_evidence`, `recommended_actions` are JSON columns on `unified_signals`. |
| Missing | `GET /api/contexts/:id/unified-signals`, `GET /api/unified-signals/:id`; sidebar/detail section that lists them; chip strip per layer. |
| Classification | 3 · 1 · 4 · 6 |
| Severity | **P0** — this is the headline deliverable of the audit. |
| Least-resistance fix | Two read-only endpoints + one EJS section above "Top Signals". Each unified signal shows 7-chip layer ribbon (`✓ N` / `– missing`) where each chip opens a panel of `unified_signal_evidence` rows for that layer. Reuse existing evidence card markup. |

### G-02 — Signal → evidence chain has no thread or producer drilldown

| Field | Value |
|---|---|
| Route/surface | `/api/signals/:id`; `partials/detail-pane.ejs` → `#evidenceList` |
| Signal/entity | `signals` row + flat `evidence` list |
| Current | The API returns a flat array of evidence packets. The UI shows title, snippet, community. Clicking does nothing structural — there is no thread view, no producer/source view, no "who else cites this packet". |
| Expected | Each evidence row exposes: thread (with all sibling comments), thread_intelligence summary, source kind/layer label, all signals that also cite this packet, link to producer output (URL). |
| Existing pattern | `threads`, `thread_packets`, `thread_intelligence` already populated. `signal_evidence` already supports reverse lookup. |
| Missing | `GET /api/evidence/:id` (packet detail + sibling packets in thread + signals citing it). `GET /api/threads/:id` (thread reconstruction + intelligence). Click handler in `app.js` that opens an evidence/thread inline panel. |
| Classification | 1 · 6 |
| Severity | **P0** |
| Least-resistance fix | Add the two endpoints; render an in-place collapsible "thread + intelligence" panel under each evidence row when clicked. |

### G-03 — Cross-layer corroboration is computed but not explainable in UI

| Field | Value |
|---|---|
| Route/surface | `/lens/:name` (lens table only); radar `#scoreComponents` |
| Signal/entity | `signal_scores.components` JSON `[name, weighted, raw, weight]` |
| Current | The score components include `cross_layer` and `corroboration` (from `graph-scorer.mjs`). The UI prints them as a flat list with no drilldown to *which* layers/sources they pulled from. |
| Expected | Each component is clickable. A "cross-layer corroboration: 0.74" pill expands to show the contributing layers + the packet IDs + the source kind. |
| Existing pattern | `graph-scorer.mjs` already returns metadata with each component. Neo4j graph holds the layer/source projection. `signal_scores.components` is already JSON. |
| Missing | API returns metadata alongside components. UI renders the metadata in an expandable card. |
| Classification | 4 · 6 · 2 |
| Severity | **P1** |
| Least-resistance fix | Extend `/api/signals/:id` to include a `score_components` array with metadata (layer list, packet IDs per component); render in the existing `#scoreComponents` slot. |

### G-04 — Conversation signals are not visibly linked to market / truth / behavior layers

| Field | Value |
|---|---|
| Route/surface | radar detail pane |
| Signal/entity | `signals` (conversation-only) vs. `evidence_packets.source_kind` (`market_prediction`, `equity_quote`, `pr`, `release_note`, `repo`, …) |
| Current | A conversation-based signal in the UI never surfaces matching market/news/truth packets even when they exist in the same context. The unification happens only inside `unified_signals` (8 rows). |
| Expected | When viewing a signal, the operator sees a "Other layers also talking about this" card with packets from non-conversation `source_kind`s that share key terms, time window, or are linked through a unified signal. |
| Existing pattern | `unified_signal_evidence` already pairs each unified signal with packets across all 7 layers. A signal-to-unified-signal join via shared evidence ids is a 1-hop query. |
| Missing | `GET /api/signals/:id/cross-layer` returning the unified signals this signal participates in, plus the non-conversation packets they pull from. |
| Classification | 2 · 5 · 3 |
| Severity | **P0** |
| Least-resistance fix | One endpoint, one detail-pane section ("Cross-layer evidence"), grouped by layer with chip strip and packet rows. |

### G-05 — Missing evidence is hidden in a single "penalty" number

| Field | Value |
|---|---|
| Route/surface | `#layerCoverage`, `#scoreComponents` |
| Signal/entity | `evidence_layers` × `signals` |
| Current | Layer coverage chips render `✓ covered` or `– missing` but the missing chips don't say *why it would matter* or *what would fill it*. Missing-evidence penalty appears as `78 - activeLayerCount * 10` text only. Unified signals already store `missing_evidence` JSON — but the field is never read. |
| Expected | Missing-layer chips are first-class: each says "no truth-layer evidence — try `gh search` / vendor docs"; each is clickable to a stub action (open producer doc, queue a discovery run). |
| Existing pattern | `unified_signals.missing_evidence` (JSON array). `source_nodes.adds` and `source_nodes.cannot` already describe lift per producer. `evidence_layers.note` already has human-readable notes per layer. |
| Missing | Read `missing_evidence`. Render notes on the empty chips. Add an action link (POST `/api/contexts/:id/discover` already exists) to fill the layer. |
| Classification | 4 · 6 · 11 |
| Severity | **P1** |
| Least-resistance fix | Extend layer-chip render in `app.js` to attach the `evidence_layers.note` as tooltip, and on the unified-signal detail render `missing_evidence` as red chips next to the layer ribbon. |

### G-06 — Lifecycle state has no operator-visible "why"

| Field | Value |
|---|---|
| Route/surface | none (lifecycle stored, but no read endpoint) |
| Signal/entity | `signal_lifecycle (state, state_reason, evidence_7d/30d/prev_30d, trend_ratio, materialized_at)` |
| Current | 111 lifecycle rows exist (8 forming, 19 emerging, 32 mature, 17 fading, 35 dormant). They are used by `extract-by-lifecycle` flow step but never appear in the UI. |
| Expected | Every signal in the detail pane shows a lifecycle badge ("FRESH · materialized 2026-04-22 · 14 packets in last 7d vs 6 in prior 30d") with `state_reason` underneath. |
| Existing pattern | `signal_lifecycle` is keyed 1:1 by `signal_id` — trivial LEFT JOIN in `/api/signals/:id`. |
| Missing | Join the table; add a badge component in `detail-pane.ejs`. |
| Classification | 7 · 6 |
| Severity | **P1** |
| Least-resistance fix | Single LEFT JOIN + a `lifecycle` block in the detail pane sidebar. Reuse existing pill CSS. |

### G-07 — Intelligence chain renders levels but loses link to source packets

| Field | Value |
|---|---|
| Route/surface | `/api/signals/:id/chain` → `#intelligenceChain` |
| Signal/entity | `intelligence_units (claim, source_type, source_id, parent_ids, confidence_basis)` |
| Current | The chain card shows confidence % and "top 3 claims" per level, but each claim is a string. Clicking a claim does not open the underlying evidence packet (when `source_type='evidence'`) or thread. |
| Expected | Each claim row is a link: claim → source packet → drilldown. Confidence basis is shown on hover. Parent-of-this-unit chain is navigable. |
| Existing pattern | `intelligence_units.source_id` already points to packets/threads/contexts. The `getChain()` helper already returns parent/child traversal. |
| Missing | Frontend dereferencing of `source_type` + `source_id` into a packet/thread fetch; show `confidence_basis` inline. |
| Classification | 6 · 1 |
| Severity | **P1** |
| Least-resistance fix | When a claim is rendered, add a `data-source-type`/`data-source-id` attribute; click handler hits `/api/evidence/:id` or `/api/threads/:id` (G-02). |

### G-08 — Lens ranking shows total + components but not *what evidence* tilted the rank

| Field | Value |
|---|---|
| Route/surface | `/lens/:name` |
| Signal/entity | `signal_scores` rows |
| Current | Lens page shows a flat table: rank, title, dominant state, mentions, score, top 3 components. No drilldown to evidence. The user cannot see *why* this lens prefers this signal. |
| Expected | Clicking a row opens the same detail pane the radar uses, scoped to the lens — same evidence chain, but with the lens components highlighted. |
| Existing pattern | Detail pane already exists. Lens components in `signal_scores.components`. |
| Missing | `/lens/:name/:signalId` route OR a fetch+render-in-place on the same page. |
| Classification | 8 · 1 |
| Severity | **P2** |
| Least-resistance fix | Make rows in lens table link to `/?context=X&signal=Y&lens=Z`; the radar already accepts a `signal=` query param. |

### G-09 — `signal_cases` group signals across communities, but cases are not browseable

| Field | Value |
|---|---|
| Route/surface | none |
| Signal/entity | `signal_cases` (76 rows) + `signal_case_members` |
| Current | Cases are created by `signal-cases.mjs` (pattern detection across communities, e.g. same failed solution) and tagged onto signals via `signals.case_id`. The UI never shows the case grouping. |
| Expected | Detail pane shows "This signal is part of case X (3 sibling signals)". A case view shows all member signals side-by-side: shared failed solutions, shared `not_x_its_y`, evidence overlap. This *is* the "group/compare" surface the goal calls for, without inventing a new model. |
| Existing pattern | `signal_cases.title`, `signal_cases.description`, `signal_case_members` join. `signal_facets` give per-tag evidence we can diff. **Gotcha discovered during audit:** the 76 `signal_cases` rows have zero rows in `signal_case_members` and `signals.case_id` is also empty — the `signal-cases.mjs` pipeline created cases but never linked members. The endpoint introduced in the patch plan returns cleanly today; the population gap is itself a P1 issue (see G-17 below). |
| Missing | `GET /api/cases/:id` (case + members + overlap stats); `/case/:id` page or modal; case badge in detail pane. |
| Classification | 9 · 1 · 2 |
| Severity | **P0** for the comparison requirement; doable in one slice because the data is ready. |
| Least-resistance fix | One endpoint, one EJS template, one badge. No new tables. |

### G-10 — Source nodes are toggles without coverage explanation

| Field | Value |
|---|---|
| Route/surface | `partials/control-plane.ejs` — Source Nodes grid |
| Signal/entity | `source_nodes (name, state, layers, lift, adds, cannot)` |
| Current | The grid shows enabled/available/gated state and a toggle. `adds`/`cannot`/`layers` are stored but rendered minimally; the user does not see "this node has added N packets / 0 packets / last fed K hours ago". |
| Expected | Each node card shows lifetime contribution: packets added, layers covered, last evidence timestamp, top community. Toggling is secondary; the card explains *what this producer actually did* for this context. |
| Existing pattern | `evidence_packets.source_id` matches `source_nodes.id` (or name). A `COUNT(*) GROUP BY source_id` per context is cheap. |
| Missing | Aggregation in `buildRadarData` to attach `{ packets_total, packets_30d, last_seen, layers_covered }` to each source node; UI to render. |
| Classification | 4 · 10 |
| Severity | **P1** |
| Least-resistance fix | Extend `buildRadarData` source-node block; render with existing pill CSS. |

### G-11 — Agent reports (research briefs, unified briefs) are not linked to evidence in the UI

| Field | Value |
|---|---|
| Route/surface | `POST /api/contexts/:id/brief` → markdown in modal. |
| Signal/entity | `research_briefs` (table exists); unified briefs (file in `output/`) |
| Current | Briefs come back as markdown blobs. They reference signals by *title* but not by ID. The operator cannot click "see the 6 packets behind this claim". |
| Expected | Brief is rendered with packet/thread IDs as inline links. Saving a brief writes its `discovery_queries` + sourced packet IDs into `research_briefs` for re-linking. |
| Existing pattern | `research_briefs` table already has columns for `evidence_count`, `community_count`, `discovery_queries`. Agent prompts already get IDs as input. |
| Missing | Agent prompt must return packet IDs alongside claims; renderer must hyperlink them. |
| Classification | 11 · 6 · 1 |
| Severity | **P1** |
| Least-resistance fix | Update agent system prompt + a small post-process in `pages.mjs` brief render that replaces `[ev:packetid]` tokens with HTML links. |

### G-12 — Threads page only exists implicitly via Evidence; no thread URL exists

| Field | Value |
|---|---|
| Route/surface | `/evidence` (`threadInsights` joined view); no `/thread/:id` |
| Signal/entity | `threads` (1,511) |
| Current | The Evidence page groups packets by `thread_id` and surfaces thread_intelligence when available. There is no permalink to a thread, no way to share a thread, no thread-detail view. |
| Expected | `/thread/:id` shows the full reconstruction + intelligence + every signal/case/unified signal that pulls from it. |
| Existing pattern | `thread_packets` already orders packets by position. `thread_intelligence` is keyed by thread. |
| Missing | One read endpoint (G-02) + a minimal EJS or in-place panel. |
| Classification | 1 · 6 |
| Severity | **P1** |

### G-13 — Search results / repos / PRs / hiring posts are stored but never grouped as a layer view

| Field | Value |
|---|---|
| Route/surface | `/evidence` table only |
| Signal/entity | `evidence_packets.source_kind ∈ { search_result, repo, pr, release_note, hiring_post, equity_quote, trader_message, … }` (13 kinds) |
| Current | The Evidence page lets the user filter by `source` (`source_id`) but does not present a *layer* view. The 13 source_kinds compress to 7 layers and there is no per-layer page or filter. |
| Expected | A "Layer" filter on `/evidence` and a `/layer/:id` view that shows all packets contributing to that layer for the active context, with the same intelligence joins. |
| Existing pattern | `evidence_packets.source_layer` is the join key; `evidence_layers.id` is the canonical 7-layer set. |
| Missing | One filter + one route. |
| Classification | 2 · 4 |
| Severity | **P2** |

### G-14 — Tests don't prove the drilldown chain holds

| Field | Value |
|---|---|
| Route/surface | `scripts/smoke-test.mjs` |
| Current | Smoke checks evidence integrity, signal integrity, source nodes — but nothing tests *can-I-drill-from-signal-to-source*: signal → evidence_packets → thread → unified signal → source_kind. |
| Expected | Smoke test asserts that for every context, at least one signal can be resolved end-to-end: it has linked evidence, evidence resolves to threads, threads have intelligence, intelligence references back to packets, and (where unified signals exist) the signal participates in a unified signal that has cross-layer evidence. |
| Missing | A drilldown-chain check block in `smoke-test.mjs`. |
| Classification | 12 |
| Severity | **P1** |

### G-15 — Detail pane fields show counts but not coverage trust

| Field | Value |
|---|---|
| Route/surface | `partials/detail-pane.ejs` |
| Current | "Mentions 42 · Communities 7" — counts. No "8 of 7 layers covered" / "0 of 7" / "score is high but corroboration is single-layer" warning. |
| Expected | Every count is paired with a coverage qualifier: how many independent layers, sources, threads contributed. |
| Existing pattern | Layer coverage already exists. Source diversity can be derived from `evidence_packets.source_id` distinct count. |
| Missing | A small `coverageSummary` block computed server-side and rendered as a strip above the score sidebar. |
| Classification | 4 · 10 |
| Severity | **P2** |

### G-17 — `signal_cases` rows exist but membership is never populated

| Field | Value |
|---|---|
| Route/surface | pipeline (no UI surface) |
| Current | `signal-cases.mjs` writes 76 rows into `signal_cases` for the `market-blindness` context but `signal_case_members` is empty (0 rows) and `signals.case_id` is `NULL` for all signals. Cases are "ghosts" — title + description with no members. |
| Expected | A signal case row must always be created together with its membership rows in one transaction. Until membership is populated, the compare UI shows empty results. |
| Existing pattern | `signal_cases.id` ↔ `signal_case_members.case_id`. The insert is straightforward once we know which signals belong. |
| Missing | Fix the writer in `src/pipeline/signal-cases.mjs`: when emitting a case, also insert one `signal_case_members` row per member and stamp `signals.case_id`. |
| Classification | 9 · 12 |
| Severity | **P1** — blocks G-09 from being useful even though the API is correct. |
| Least-resistance fix | Add the joint insert + a smoke check that asserts `signal_cases` row count == count of distinct `case_id` values in `signal_case_members`. |

### G-16 — Neo4j graph is reachable but its links aren't navigable from the UI

| Field | Value |
|---|---|
| Route/surface | none |
| Signal/entity | `:SignalsRepo` (navigation KG) and the data graph projected by `src/graph/` |
| Current | `graph-scorer.mjs` queries the graph at score-time. The graph has `CO_OCCURS_WITH` / `MENTIONS` / community-spread relationships. The UI has no graph view, no related-signal navigator. |
| Expected | "Related signals" (already a section) is populated from `signal_related`, but the connector type is opaque ("0.84"). Should say "co-occurs in 6 threads" / "shares failed solution `Cursor`". |
| Existing pattern | `signal_related (label, tag, score)`. |
| Missing | Type the score, render the basis. |
| Classification | 2 · 6 |
| Severity | **P2** |

---

## Severity rollup

| Severity | Issue IDs |
|---|---|
| **P0** | G-01, G-02, G-04, G-09 |
| **P1** | G-03, G-05, G-06, G-07, G-10, G-11, G-12, G-14, G-17 |
| **P2** | G-08, G-13, G-15, G-16 |

The P0 block forms the priority slice and is the subject of `SIGNAL_AGENT_MVP_PATCH_PLAN.md`. Together they answer the four operator questions the goal demands:

1. **Why does this signal exist?** — G-02 (evidence chain) + G-07 (intelligence units linked back to packets)
2. **What corroborates it?** — G-01 (unified signals) + G-04 (cross-layer view)
3. **What is missing?** — G-05 (missing-evidence chips)
4. **Can I compare it to others?** — G-09 (cases as built-in grouping)
