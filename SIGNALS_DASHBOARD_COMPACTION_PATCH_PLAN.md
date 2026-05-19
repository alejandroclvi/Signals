# Signals Dashboard — Compaction Patch Plan

**Companion to:** `SIGNALS_DASHBOARD_COMPACTION_REPORT.md`
**Stack:** Express + EJS + vanilla JS + hand-written CSS. No bundler, no framework.
**Strategy:** ship in phases; preserve current functionality at every step; one zone at a time.

---

## Phase 1 — Layout compression (foundation)

**Files:** `src/views/layout.ejs`, `src/views/partials/topbar.ejs`, `src/public/style.css`

1. Restructure `.app` grid: keep `sidebar | main`; restructure `.main` from vertical stack to:
   ```
   .main
     .intel-strip                ← Zone A (KPIs + pipeline + search + refresh, ~52px)
     .coverage-strip             ← Zone A (7 layer chips, ~44px)
     .workspace (.dashboard-grid) ← Zones B+C side by side, flex available height
       .inbox     (Zone B)
       .detail    (Zone C — moved from below)
     .radar-band                 ← optional; hidden by default
   ```
2. Merge `.topbar` + `.metric-strip` + `.pipeline-health-bar` + `.context-brief` into `.intel-strip` (one shared row).
3. Move `.detail-pane` from below `.control-plane-grid` into `.workspace` as the right column.
4. Move `.bubble-zone` into `.radar-band`; default `display: none`; show with toggle.
5. Remove `.control-plane-grid` as a separate stacked section; its content (coverage + sources + recommendations) collapses into `.coverage-strip`.
6. CSS: tighten `--gutter` to 14px (from 22px) on workspace internals.

**Acceptance:** Inbox and selected detail visible at the same time on a 1440×900 viewport without scrolling.

---

## Phase 2 — Signal list redesign

**Files:** `src/public/app.js` (`renderSignalList`), `src/public/style.css` (`.signal-list`, `.signal-row` if exists)

1. Each row becomes a 2-line densified card:
   - **Line 1**: rank pill · title (700) · lifecycle badge · confidence dots
   - **Line 2**: intent dot · tags · `N/7 layers` chip · 7d delta arrow
2. Row padding: 14px → 9px vertical. Total row height target ~52px.
3. Selected state: 3px left accent stripe (color matches lifecycle state).
4. Hover state: subtle background tint, not a thick border.
5. Keyboard: `↑ / ↓` navigates, `Enter` selects, `o` opens top evidence drawer.
6. Add `data-lifecycle="<state>"` attribute on each row → CSS picks accent color.

**Acceptance:** 12+ rows visible at 900px height without scrolling. Selected row is unambiguous at a glance.

---

## Phase 3 — Radar right-sizing

**Files:** `src/views/partials/control-plane.ejs` (removed), `src/views/layout.ejs`, `src/public/app.js`

1. Bubble chart moves into `.radar-band` (collapsed by default).
2. Toggle button in `.intel-strip`: "Radar ▾" → expands a 280px-tall band above `.workspace`.
3. Toggle state persists in `localStorage("signals.radarOpen")`.
4. When closed, no DOM rendered → no JS overhead.
5. Default closed.

**Acceptance:** Radar accessible in one click; absent by default; no layout shift when toggled.

---

## Phase 4 — Evidence coverage UI (the top coverage strip)

**Files:** new `.coverage-strip` markup in `layout.ejs`, CSS classes, app.js bindings

1. Replace 3 stacked control-plane cards with one 44px strip:
   ```
   COVERAGE  [✓ Conversation 2,113]  [✓ Intent 320]  [✓ Behavior 212]
             [✓ Expectation 145]  [✓ Economic 32]  [✓ Capital 1,093]
             [✓ Truth 90]                                  + angle ▾
   ```
2. Each chip: layer name + live evidence count + ✓/✗ glyph.
3. Click chip → drilldown drawer shows evidence packets for that layer.
4. Right-side `+ angle ▾` opens recommendation popover (Add another source / Toggle source-nodes).
5. Source-nodes toggle UI moves into the popover (no longer eats a panel).
6. Caption: "N/7 layers active in this context" — replaces the old `#coverageCaption`.

**Acceptance:** All 7 layers visible at a glance with live counts; toggling a source takes ≤2 clicks; no layout shift.

---

## Phase 5 — Source / layer compaction

**Files:** `src/views/partials/control-plane.ejs` (delete), `src/public/app.js` (`renderControlPlane` → `renderCoverageStrip`)

1. Delete `.layer-ladder`, `.source-node-grid`, `.recommendation-list` from DOM.
2. New `renderCoverageStrip()` writes the chip set into `.coverage-strip`.
3. Source toggles render inside the popover when `+ angle ▾` clicked.
4. Recommendations render inside that same popover, ranked by lift.
5. Remove orphan CSS (`.control-plane-grid`, `.control-panel`, `.layer-ladder`, `.source-node`, `.recommendation`).

**Acceptance:** No "SaaS-grid" row of 3 cards on the radar page; all coverage + sources information still reachable in ≤2 clicks.

---

## Phase 6 — Detail-page compression

**Files:** `src/views/partials/detail-pane.ejs`, `src/public/app.js`, `src/public/style.css`

1. Sticky header at top of `.detail-main`:
   ```
   ┌──────────────────────────────────────────────────────┐
   │ #N TITLE                                              │
   │ tags · lifecycle · confidence · age   Save Dismiss ⚡  │
   └──────────────────────────────────────────────────────┘
   ```
   Always visible while scrolling detail body. `position: sticky; top: 0; background: #fff; border-bottom: 1px solid var(--line)`.
2. Below sticky header, **corroboration + layer band** is the first content block (not the 8th).
3. Restructure detail body to a 2-col layout (`grid-template-columns: 1fr 360px`):
   - **Left col**: Thesis (Why this matters) → Cross-source theses → Representative evidence
   - **Right col**: Cross-source corroboration (chip ladder) → Thread intel → Deep insight → Vocabulary → Communities → Score → Layer coverage → Intelligence chain
4. Section labels: 28px+12px gap → 22px+6px gap. Caps still uppercase, but tighter.
5. The empty-section-hide helper (already shipped) stays — every section can collapse on missing data.
6. Suggested block at bottom: merge into `intel-strip`'s right side (or remove if it's purely decorative).

**Acceptance:** Detail content first 600px shows: signal identity, actions, corroboration, layer coverage, thesis, top 2 evidence cards. Previously took >1200px.

---

## Phase 7 — Selected-signal workflow

**Files:** `src/public/app.js`, `src/public/style.css`

1. Accent stripe color computed from `selectedSignal.dominant_state` or lifecycle. Same color on:
   - Inbox row (3px left stripe)
   - Detail sticky header (3px bottom stripe)
   - Lifecycle badge in detail
2. Inbox row scrolls into view on programmatic selection (e.g., after drawer dismiss).
3. URL hash updates: `/?context=X#signal=ID` — selection survives reload.
4. `aria-selected="true"` on selected row; `aria-controls="detailPane"`.

**Acceptance:** Looking at the screen mid-task, you can answer "what am I working on?" in ≤200ms.

---

## Phase 8 — Responsive rules

**Files:** `src/public/style.css`

| Width | Behavior |
|---|---|
| ≥ 1680px | Inbox 380px, detail flex, radar band shows 4 columns of bubbles when open. |
| 1280–1679 | Inbox 340px, detail flex, radar band tight. |
| 960–1279 | Inbox 320px, detail stacks below inbox (current behavior). Sidebar collapses to icons. |
| < 960 | Banner: "Open on a wider screen for full radar." Hide most chrome, show inbox only. |

CSS-only with `@media (min-width: …)`.

**Acceptance:** All three layouts usable; no horizontal scrollbars at any width ≥ 960px.

---

## Phase 9 — UX tests

Manual checklist post-implementation:

- [ ] **Glance test**: 5 seconds on the dashboard, can the operator name the active topic + most urgent signal? Pass if yes.
- [ ] **Compare test**: switch between 3 signals using arrow keys; detail updates < 100ms each. Pass if no flash.
- [ ] **Drill test**: from a selected signal, reach the original Reddit URL in ≤ 3 clicks.
- [ ] **Coverage test**: toggle a source on/off; coverage strip updates in place; evidence count changes within 1 refresh.
- [ ] **Empty state test**: open a signal with sparse data; sections hide; layout doesn't break.
- [ ] **Wide screen test**: at 1920×1080, no element wider than necessary; no horizontal scroll.
- [ ] **Keyboard test**: tab order is inbox → filters → detail-actions → detail-body. Enter / ↑↓ work in inbox.
- [ ] **Visual smoke**: take screenshots before and after each phase; diff for unintentional regressions.

---

## Patch ordering (commit-by-commit)

| Commit | Phases | Risk |
|---|---|---|
| 1 | Phase 1 (layout shell) | Medium — touches all pages' layout.ejs |
| 2 | Phases 4 + 5 (coverage strip, kill 3-card row) | Low — net code deletion |
| 3 | Phase 2 (inbox redesign) | Low — isolated to signal-list |
| 4 | Phase 6 (detail compression) | Medium — many sections affected |
| 5 | Phases 7 + 8 (selected continuity + responsive) | Low |
| 6 | Phase 3 (radar band + toggle) | Low — additive only |
| 7 | Phase 9 (visual + UX verification) | None |

Each commit must leave the dashboard fully working. No phase depends on subsequent phases.

---

## Out of scope (deliberately not in this redesign)

- Multi-select comparison view (stretch goal in report §8)
- New chart types (timeline, heatmap, intent-bars are hidden in current control-plane — leave hidden)
- Mobile / phone layout (only ≥960px is officially supported)
- New data fields (no schema changes — pure UI)
- Theme switching (light-only for now)
- Sidebar redesign (account / nav blocks — out of scope; only collapsing)

---

## What "done" looks like

A 1440×900 viewport showing:
- 52px intel strip (topic + KPIs + search)
- 44px coverage strip (7 layer chips, live counts)
- 720px workspace = inbox (≥12 rows visible) + detail (sticky head, corroboration, thesis, evidence — all above the fold)
- No control-plane stack of 3 boxes
- Editorial feel preserved: serif headings, neutral palette, accent restraint
- All 14+ detail subsections still reachable, just denser
- Source CTA links to real URLs (already shipped)
- Empty sections auto-hide (already shipped)

Net result: roughly **3× more information per viewport** while keeping the room feel of a research desk, not an admin panel.
