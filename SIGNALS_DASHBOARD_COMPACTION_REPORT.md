# Signals Dashboard — Compaction Report

**Date:** 2026-05-19
**Subject:** Audit + redesign brief for the main `/` dashboard, with an eye toward density without losing the editorial intelligence-desk feel.

## 1. What's strong (must stay)

| Element | Why it works |
|---|---|
| **Neutral premium palette + editorial typography** | Trading-terminal seriousness; instantly different from a SaaS Bootstrap grid. |
| **Sidebar with context selector + workspace nav** | Single point of "which topic am I in." Anchors the user. |
| **Ranked signal inbox** | Primary driver of operator decisions. Selection drives detail. |
| **Intent filters strip** (pain/seeking/tried_failed/insight/comparing/warning) | High-utility — distinct chip set, fast lens switching. |
| **Lifecycle + case badges** (signalBadges) | Compact, semantically dense. |
| **Cross-source corroboration band** (crossLayer) | The load-bearing claim of the system. |
| **Unified-signal cards** (unifiedList) | New cross-layer thesis surface. Earns its space. |
| **Evidence drawer (recursive, source CTA)** | Recently rebuilt — drills work; preserves source attribution. |
| **Layer-coverage ladder** (7 chips) | Honest absence-as-evidence display. |
| **Signal Radar bubble chart** (as a *visualization*, optionally) | Editorial flourish that differentiates from a list-only product. But it pays its rent only for users who actually use it. |

These collectively define the product. We compress them; we do not flatten them.

## 2. What's too large or sparse

| Element | Current footprint | Problem |
|---|---|---|
| **Topbar** | 76px tall, has "Signals" title + "Live" dot duplicating sidebar brand | Repeated identity, eats vertical space. |
| **Metric strip** (`#metrics`) | Full-width row of large numbered tiles | KPI band has utility but ~80px tall and not visually anchored to action. |
| **Pipeline health bar** | Full-width row, often empty/thin | Borrows space whether it has data or not. |
| **Context brief** (`#contextBrief`) | Full-width row above grid, mostly thesis + avatar text | Usually 1–2 lines, sometimes 0 — owns a full row regardless. |
| **Signal Radar bubble chart** | ~50% of `.dashboard-grid` width, ~`100vh - 140px` tall | Showy. Real navigation happens in the inbox. Bubble chart's marginal info value per pixel is low for most operator tasks. |
| **Three control-plane cards** (Source coverage / Sources / Add another angle) | Equal-weight horizontal row of 3 boxes | Classic SaaS grid feel — equal weight implies equal importance, but they aren't equal. |
| **Source-node cards** | Big rectangular tiles per producer | Compact 7 producers; current rendering uses ~120px per tile. With 10 producers this becomes a sea of tiles. |
| **Detail pane below the fold** | Below `.dashboard-grid` + control-plane | Operator can't see inbox and detail together — must scroll. |
| **Detail pane subsections** (~15 `section-label` headers) | Each header eats 28px + content row | Many are already hidden when empty (prior task), but layout still feels like a stack rather than a workspace. |
| **Suggested block** (at bottom of detail-side) | One icon + one line | Owns its own row. |

## 3. What should compress / merge

**Top strip (replaces topbar + metric-strip + pipeline-health + context-brief — currently ~270px):**
- Topic name + lens · live indicator · Cmd+K search · refresh — one row, 40px
- KPIs as inline `metric · value` pairs in a sub-row, 28px
- Pipeline / smoke-test status as a single colored dot or one-liner, inline with KPIs
- Context thesis collapses to a one-liner with "…" expand affordance

**Source coverage panel (replaces 3 control-plane cards — currently ~280px):**
- Single row showing 7 layer chips with live counts and inline source-node toggles per layer
- Recommendations relegated to a "+ angle" link that opens a small popover
- Total height target: 56px (one row)

**Dashboard grid (replaces the existing dashboard-grid + detail-pane stack):**
- Two columns at full available height: inbox (left ~360px) + detail (right, flex)
- Radar moves to a collapsible 56px-tall horizontal sparkline-bubble strip above the two columns; off by default; toggle in the top strip

**Signal-inbox rows:**
- Title (700) on top line · rank pill · lifecycle badge · confidence chip on the same line
- Tags + intent dot + layer-count + delta indicator on a sub-line
- Reduce row padding from current ~14px to 9px

**Detail pane:**
- Sticky header: title + tags + actions (Save / Dismiss / Alert / Analyze) inline, always visible while scrolling detail body
- Corroboration + layer coverage = first content band (currently mid-page)
- Two-column body where it makes sense:
  - Left: Thesis ("Why this matters") · Cross-source theses · Representative evidence
  - Right: Lifecycle badges · Cross-source corroboration · Thread intelligence · Deeper insight · Vocabulary · Communities · Score · Layers · Intelligence chain
- Section-label height reduced from 28px+gap to 22px
- Hide-when-empty (already implemented) stays

## 4. What becomes expandable / sticky / secondary

| Element | Pattern |
|---|---|
| **Signal Radar bubble chart** | Hidden by default; toggle in top strip; renders as a 320px-tall expandable band above the grid. |
| **Recommendations** ("Add another angle") | "+ angle" link → opens a small popover, not a panel. |
| **Detail-pane actions** | Sticky to the top of the detail-main column while scrolling. |
| **Lifecycle history**, deeper extractions, vocabulary | Collapsible `<details>` blocks; expand on click. Default collapsed if >3 items. |
| **Layer coverage** | Promoted into the top strip; the per-signal "evidence layers" stays in detail-side but compact. |
| **Pipeline health** | Single dot in top strip with hover tooltip showing details; collapses entirely when healthy. |

## 5. Compact layout proposal (3 zones)

```
┌─────────────┬──────────────────────────────────────────────────────────┐
│  SIDEBAR    │  ZONE A — Intelligence Strip                              │
│             │  ├ topic · lens · live · search · refresh · ⌘K           │
│  (sticky    │  ├ KPIs inline · pipeline-dot · ▼ radar (collapsed)      │
│   workspace │  └ Coverage strip: 7 layer chips · source toggles ▾      │
│   nav)      ├──────────────────────────────────────────────────────────│
│             │  ZONE B (left col 360px)  │ ZONE C (right col flex)      │
│             │  ┌───────────────────────┐│┌────────────────────────────┐│
│             │  │ filters (intent)      ││ sticky head: signal + acts ││
│             │  │ ─────────────────     ││├────────────────────────────┤│
│             │  │ rank · title · life   ││ corroboration + layer band ││
│             │  │ rank · title · life   ││ cross-source thesis cards  ││
│             │  │ rank · title · life   ││ ── 2-col body ──           ││
│             │  │ ✓ rank · title · life ││  L: thesis · evidence       ││
│             │  │ rank · title · life   ││  R: intel · vocab · score   ││
│             │  │ ...                   ││ intelligence chain          ││
│             │  └───────────────────────┘│└────────────────────────────┘│
└─────────────┴──────────────────────────────────────────────────────────┘
```

Selected continuity: the selected row in B shows an accent stripe AND the detail header in C echoes the same accent. Bidirectional `aria-selected`/`aria-current` for keyboard users.

## 6. Hierarchy proposal

1. **Glance** — Zone A. Topic alive? Pipeline healthy? What layers are lit?
2. **Compare** — Zone B. Which signal matters most? Filter by intent.
3. **Inspect** — Zone C top half. What does this signal say? What corroborates it?
4. **Act** — Zone C sticky header. Save/Dismiss/Alert/Analyze without scrolling.

No equal-weight boxes — every section size signals importance.

## 7. Interaction model

- **Click row in inbox** → updates detail in place (no scroll, no reload).
- **Keyboard arrows** in inbox → navigate selection; Enter opens drawer for top evidence.
- **Cmd+K** → global search across signals, topics, communities.
- **Click layer chip in coverage strip** → filters Zone B + Zone C to that layer.
- **Click intent chip in detail** → opens drilldown drawer with all packets matching that intent.
- **Click evidence card** → drilldown drawer (already implemented).
- **⇧-click in inbox** → adds to comparison set (future / stretch).

## 8. Comparison flow (stretch — not in first patch)

- Inbox supports multi-select via ⇧-click.
- Detail pane splits horizontally into 2 mini-detail columns when 2 selected.
- Limit 3 in comparison; beyond that becomes a separate "comparison view" route.

## 9. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Compression strips editorial soul, dashboard feels like a SaaS grid | Keep serif headings (32+px), generous line-height inside compact rows, preserve color hierarchy (one accent, gray scale otherwise). |
| Hiding radar by default upsets users who use it | Keep toggle in top strip; remember preference in localStorage. |
| Selected state ambiguity if inbox + detail aren't visually tied | Accent stripe on selected row + matching accent in detail-head + matching color on lifecycle chip. |
| Vertical scroll feels worse, not better, if detail body is too long | Use 2-column body in detail; collapse low-priority sections by default; sticky action header always visible. |
| Responsive breakpoint < 1280px breaks the two-column | At <1280px: detail stacks below inbox like today (graceful degradation). |
| Existing keyboard/aria interactions break | Audit `aria-selected` / `aria-current` / focus order in patches; add tests for keyboard nav. |
| Coverage strip becomes a wall of chips on wide contexts | Cap to active layers + collapse expandable producer toggles; show "+N more" with click-to-expand. |
| Big CSS refactor introduces visual regression | Phase the work; ship one zone at a time; visual smoke test screenshots between phases. |

## 10. Decisions to make

1. **Radar default state**: hidden / collapsed-band / full panel — decide based on operator usage. **Proposal: hidden, toggle in top strip.**
2. **Right column width**: 380 / 430 / 50% — depends on body 2-col density. **Proposal: flex-grow; min-width 480px; max-width 1080px.**
3. **Sidebar collapse**: at <1440px wide, sidebar collapses to icons. **Proposal: yes, with keyboard escape.**
4. **Mobile**: out of scope; show "use a wider screen" notice at <960px. **Proposal: yes.**

---

*See companion patch plan: `SIGNALS_DASHBOARD_COMPACTION_PATCH_PLAN.md`.*
