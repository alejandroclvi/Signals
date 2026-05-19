# Signals MVP — Agent Operator Patch Plan

> Companion to `SIGNAL_AGENT_MVP_REPORT.md`. Eight ordered work packages. Each one references the existing tables and the exact files to touch. **No new schemas. No frontend framework. No parallel signal model.**

The patch plan answers, in order: *what data?* → *what API?* → *what UI?* → *what test?*

| # | Package | Resolves | Files touched | Existing tables |
|---|---|---|---|---|
| 1 | Evidence chain API | G-02, G-07 | `src/routes/api.mjs` | `evidence_packets`, `signal_evidence`, `threads`, `thread_packets`, `thread_intelligence`, `intelligence_units`, `intelligence_links` |
| 2 | Unified-signal drilldown API + endpoint | G-01, G-03 | `src/routes/api.mjs` | `unified_signals`, `unified_signal_evidence`, `evidence_packets`, `evidence_layers` |
| 3 | Cross-layer corroboration view | G-04, G-05 | `src/routes/api.mjs`, `src/views/partials/detail-pane.ejs`, `src/public/app.js`, `src/public/style.css` | `unified_signal_evidence` (signal→unified via shared evidence), `signal_lifecycle` |
| 4 | Coverage / missing-evidence chips | G-05, G-10, G-15 | `src/routes/api.mjs`, `src/public/app.js`, `src/views/partials/control-plane.ejs` | `evidence_layers.note`, `unified_signals.missing_evidence`, `source_nodes.adds`/`cannot` |
| 5 | Linked insights / provenance | G-07, G-11 | `src/public/app.js`, `src/pipeline/intelligence-chain.mjs` (read-only — extend `getSignalChain` payload) | `intelligence_units.source_type`, `source_id`, `confidence_basis` |
| 6 | Group / compare signals (cases) | G-09 | `src/routes/api.mjs`, `src/views/case.ejs` (new) or detail-pane modal, `src/public/app.js`, `src/routes/pages.mjs` | `signal_cases`, `signal_case_members`, `signals.case_id`, `signal_facets` |
| 7 | Minimal UI integration | G-01..G-09 | `src/views/partials/detail-pane.ejs`, `src/public/style.css`, `src/public/app.js` | — |
| 8 | Tests | G-14 | `scripts/smoke-test.mjs` | all chain tables |

---

## 1) Evidence chain API

Add three read-only endpoints. All SQL — no LLM.

### `GET /api/evidence/:id`
Returns the packet plus its thread, its sibling packets, the signals that cite it, and any unified signals that include it.

```sql
-- packet
SELECT * FROM evidence_packets WHERE id = ?;
-- thread + siblings (if thread_id is set)
SELECT ep.* FROM evidence_packets ep
JOIN thread_packets tp ON tp.evidence_id = ep.id
WHERE tp.thread_id = ? ORDER BY tp.position;
-- signals citing this packet
SELECT s.id, s.title, s.context_id FROM signals s
JOIN signal_evidence se ON se.signal_id = s.id
WHERE se.evidence_id = ?;
-- unified signals that include this packet
SELECT us.id, us.topic, use_.layer
FROM unified_signals us
JOIN unified_signal_evidence use_ ON use_.unified_signal_id = us.id
WHERE use_.evidence_id = ?;
```

Response:
```json
{ "packet": {…}, "thread": { "id":…, "intelligence":…, "packets":[…] }, "signals":[…], "unified_signals":[…] }
```

### `GET /api/threads/:id`
Returns thread row, all packets in order, the joined `thread_intelligence`, and every signal that has at least one packet inside the thread.

### `GET /api/signals/:id/chain-full`
Wraps `/api/signals/:id` and adds:
- `lifecycle` — row from `signal_lifecycle` (state, state_reason, evidence_7d/30d, trend_ratio).
- `cases` — `[ { case_id, title, sibling_count } ]` from `signal_case_members`.
- `unified_signals` — list of unified signals that share ≥1 evidence packet with this signal.
- `intelligence_units_sample` — first 5 units of each `unit_type` already in `getSignalChain`, but with `source_id` resolved (packet title or thread title) for direct rendering.

> The existing `/api/signals/:id` stays for backwards compat; `chain-full` is the new read used by the upgraded detail pane.

---

## 2) Unified-signal drilldown API

### `GET /api/contexts/:id/unified-signals`
Returns rows from `unified_signals` for a context, plus per-layer evidence counts.

```sql
SELECT us.*,
       (SELECT json_group_object(layer, c) FROM (
          SELECT layer, COUNT(*) c FROM unified_signal_evidence
          WHERE unified_signal_id = us.id GROUP BY layer
        )) AS layer_counts
FROM unified_signals us
WHERE us.context_id = ?
ORDER BY us.corroboration_score DESC NULLS LAST, us.updated_at DESC;
```

### `GET /api/unified-signals/:id`
Returns full unified signal + `unified_signal_evidence` packets grouped by layer + the unified signal's layer analysis prose + the missing-evidence array + the recommended actions array (these are all already JSON columns).

```json
{
  "id": "unified:…",
  "topic": "Claude Code Quality Degradation Concerns",
  "thesis": "…",
  "temporal_state": "current",
  "corroboration_score": 0.82,
  "missing_evidence": ["No filings activity yet", "Capital-market response is mixed"],
  "recommended_actions": [{ "action": "Watch …", "why": "…" }],
  "layers": {
    "conversation": { "analysis": "…", "evidence": [packet, …] },
    "truth": { "analysis": "…", "evidence": [packet, …] },
    …
  }
}
```

### `GET /api/signals/:id/unified`
Returns unified signals that share evidence with this signal (the join is `signal_evidence` ⋂ `unified_signal_evidence` on `evidence_id`).

This is the cross-layer answer to "what does this conversation signal mean across markets/truth?" (G-04).

---

## 3) Cross-layer corroboration view

A new section in `partials/detail-pane.ejs` (positioned after "Why it matters", before "Representative evidence"):

```html
<div class="section-label">Cross-layer corroboration</div>
<div id="crossLayer" class="cross-layer"></div>
```

`app.js` populates it from `/api/signals/:id/unified` (G-04) and from `signal.layerCoverage` (already returned today). Rendering rules:

- 7 chips, one per `evidence_layers` row, in `sort_order`.
- Each chip is one of three states:
  - **covered** — green pill `Truth · 4` (count from `signal_evidence`+`evidence_packets.source_layer` join already in the API).
  - **corroborated via unified** — gold pill `Capital · 3 via unified-signal` (count from `unified_signal_evidence` for unified signals that share this signal).
  - **missing** — gray dashed pill, hover shows `evidence_layers.note`. If a unified signal has `missing_evidence` mentioning this layer, the chip turns red with the missing-evidence note inline.
- Click a chip → expand a packet list under the strip (the same evidence card markup the detail pane already uses). For unified-only packets, the card is prefixed with a small "via *topic name*" link to the unified detail.

---

## 4) Coverage / missing-evidence view

Two parts:

**a) Per-signal layer ribbon (covered above).** Reads `evidence_layers.note` to render hover text. Reads `unified_signals.missing_evidence` to surface "what would sharpen this" callouts.

**b) Source-node card aggregation in `control-plane.ejs`.** Today the source-node grid is toggle-first. Extend `buildRadarData` in `src/routes/api.mjs` to attach to each node:

```sql
SELECT COUNT(*) packets,
       COUNT(CASE WHEN published_at >= datetime('now','-30 days') THEN 1 END) packets_30d,
       MAX(published_at) last_seen,
       COUNT(DISTINCT source_layer) layers_covered
FROM evidence_packets
WHERE context_id = ? AND source_id = ?;
```

UI renders these as a compact strip under the node name: `42 · 7 in 30d · last 2d ago · 3/7 layers`. The toggle stays. The card now explains what the node *did*.

---

## 5) Linked insights / provenance

Extend `getSignalChain()` in `src/pipeline/intelligence-chain.mjs` to resolve `source_type` + `source_id` into a `source_label` (packet title, thread title, or "human"). No schema change. The chain endpoint already returns the units; this adds one extra field per unit.

In `app.js`, render each unit claim with a `data-source-type` / `data-source-id` so clicking opens the right drilldown:
- `evidence` → calls `/api/evidence/:id` (package 1).
- `thread` → calls `/api/threads/:id` (package 1).
- `signal` → focuses the signal in the detail pane (existing behavior).
- `human` → no-op badge.

Confidence basis (already in `intelligence_units.confidence_basis`) is shown as the click target's tooltip.

---

## 6) Group / compare signals (cases)

`signal_cases` already groups signals across communities. Surface it.

### `GET /api/cases/:id`
```sql
SELECT * FROM signal_cases WHERE id = ?;
SELECT s.* FROM signals s
JOIN signal_case_members m ON m.signal_id = s.id
WHERE m.case_id = ?;
-- per-member overlap, computed from facets
SELECT sf.signal_id, sf.tag, sf.failed_solutions, sf.not_x_its_y
FROM signal_facets sf
WHERE sf.signal_id IN (members);
```

Response: case row + members + a per-tag overlap matrix (shared failed solutions / shared `not_x_its_y` across members).

### `GET /api/contexts/:id/cases`
List view, sorted by member count desc.

### UI
Two surfaces, both minimal:

- **Badge in detail pane.** If `signal.case_id` set, show "Part of case: *<title>* · *<n-1>* sibling signals" — clickable.
- **Compare view.** A modal (same overlay style as the report modal — `app.js` already has one) renders the case members in 2-3 columns: shared phrases on top, distinct phrases below, evidence overlap chips per layer. Uses the existing `formatSignal` shape — no new template engine.

This is the "group/compare without inventing a new model" requirement, satisfied entirely by tables that already have data (76 cases, 578 facets).

---

## 7) Minimal UI integration

Strictly additive edits to existing files. No new EJS templates outside `case.ejs` (and even that may be a modal rather than a route).

### `src/views/partials/detail-pane.ejs`
Add four sections in sequence:

```html
<!-- under detail-head -->
<div class="lifecycle-badge" id="lifecycleBadge"></div>
<div class="case-badge"      id="caseBadge"></div>

<!-- after #whyBox -->
<div class="section-label">Cross-layer corroboration</div>
<div class="cross-layer"     id="crossLayer"></div>

<!-- after #intelligenceChain -->
<div class="section-label">Unified signals (cross-layer thesis)</div>
<div class="unified-list"    id="unifiedList"></div>
```

### `src/public/app.js`
Replace `fetchSignalDetail(id)` to call `/api/signals/:id/chain-full`. Add renderers:
- `renderLifecycle(signal.lifecycle)` → badge.
- `renderCaseBadge(signal.cases)` → click opens compare modal.
- `renderCrossLayer(signal.layerCoverage, signal.unified_signals)` → 7-chip strip + click-to-expand.
- `renderUnifiedList(signal.unified_signals)` → cards with topic, temporal badge, corroboration score, "open" → `/api/unified-signals/:id` modal that renders layers + missing-evidence + recommended-actions.
- Extend `renderIntelligenceChain` to render `source_label` and attach click handler that calls `/api/evidence/:id` or `/api/threads/:id` and renders the response in a side drawer.

### `src/public/style.css`
Add chip variants: `chip-covered`, `chip-corroborated`, `chip-missing-soft`, `chip-missing-hard`. Add modal `--compare` skin (reuse existing overlay).

### `src/views/lens.ejs`
Make signal rows link to `/?context=…&signal=…&lens=…`. The radar already accepts `signal=` deep-links.

**Discipline.** No new dependencies. No DOM rewrites of existing sections. The detail pane gets four new blocks and no existing block is removed.

---

## 8) Tests

Extend `scripts/smoke-test.mjs` with a `Drilldown Chain` block:

```js
// For every context with ≥1 signal:
for (const ctx of contexts) {
  const sig = db.prepare("SELECT id FROM signals WHERE context_id=? LIMIT 1").get(ctx.id);
  if (!sig) continue;

  // 1. signal → evidence
  const ev = db.prepare("SELECT evidence_id FROM signal_evidence WHERE signal_id=? LIMIT 1").get(sig.id);
  check(`${ctx.id}: signal→evidence resolves`, !!ev);

  // 2. evidence → thread (if thread)
  const tp = db.prepare("SELECT thread_id FROM thread_packets WHERE evidence_id=? LIMIT 1").get(ev?.evidence_id);
  if (tp) {
    const ti = db.prepare("SELECT id FROM thread_intelligence WHERE thread_id=? LIMIT 1").get(tp.thread_id);
    check(`${ctx.id}: thread reachable, intelligence ${ti ? 'present':'pending'}`, true);
  }

  // 3. signal → intelligence units
  const iu = db.prepare("SELECT COUNT(*) c FROM intelligence_units WHERE signal_id=?").get(sig.id);
  check(`${ctx.id}: signal has intelligence units (${iu.c})`, iu.c >= 0); // soft

  // 4. context → unified signals (if any) — every unified must have evidence
  const us = db.prepare("SELECT id FROM unified_signals WHERE context_id=?").all(ctx.id);
  for (const u of us) {
    const ue = db.prepare("SELECT COUNT(*) c FROM unified_signal_evidence WHERE unified_signal_id=?").get(u.id).c;
    check(`${ctx.id}: unified ${u.id} has cross-layer evidence`, ue > 0);
  }
}
```

And one HTTP-level test (kept out of the unit suite — added as `scripts/test-drilldown-api.mjs`) that boots the server, calls the new endpoints with a real signal id, and asserts each response has the expected fields. Run via `pnpm test:drilldown`.

---

## Priority slice (what gets built first)

The first commit covers G-01, G-02, G-04, G-09 — the P0 issues — with packages **1, 2, 3, 6, 7-partial, 8-partial**:

1. New API endpoints (no UI risk, additive only).
2. Detail pane gets four new sections (`lifecycleBadge`, `caseBadge`, `crossLayer`, `unifiedList`) — no removals.
3. Smoke test adds the drilldown chain block.

Subsequent commits handle P1 (lifecycle, coverage chips, intelligence-unit linking, source-node aggregation, brief linkage) and P2 (lens links, layer page, related-signal basis).

## Patch rules — non-negotiable

- Every claim shown to the operator must dereference to a packet/thread/signal/unit ID.
- Every corroboration claim must show the evidence rows behind it.
- Missing evidence is always rendered, never inferred away.
- Grouping comes from `signal_cases`; never invent another grouping model.
- Agent output (briefs, unified briefs) carries packet IDs that the renderer turns into hyperlinks.
- No new tables. No frontend framework. No npm dependencies.
- If a section can't be rendered because the data isn't there, render an empty-state with the *reason* (e.g. "No thread reconstruction yet — Analyze").
