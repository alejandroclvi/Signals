# Signals — Workspace Instructions

## What This Is

Signals is an early-warning system for detecting internet momentum. It surfaces behavior changes (not just mentions) from online sources — starting with Reddit — and helps users understand what is changing, among whom, and why it might matter.

This workspace is currently in **local proof-of-concept** phase. The goal is to prove the core intelligence loop before building production infrastructure.

## Current State

- **Phase**: Pre-MVP, local PoC
- **First slice**: Reddit Category Pain Radar
- **Dashboard prototype**: `dashboard-prototype/index.html` (static HTML/CSS/JS, no build step)
- **Fixtures**: `dashboard-prototype/fixtures/` — replay data for law firms and founder AI tools scenarios
- **Live pull tool**: `dashboard-prototype/tools/pull-reddit-search.mjs` (Node.js, needs network)
- **Research docs**: `research/` — producer viability, corroboration engine, system architecture
- **Obsidian vault**: `00 Home/` through `07 Sources/` — project knowledge base
- **Role prompts**: `role-prompts/` — 7 builder role definitions for the team
- **Linear plan**: `linear/SIGNAL_MVP_LINEAR_PROJECT_PLAN.md`
- **MVP target**: June 12, 2026

## Core Loop To Prove

```
source data (or replay fixture)
-> normalized evidence packets
-> candidate signal
-> score components
-> missing evidence
-> source enablement recommendation
-> local dashboard
```

## Key Concepts

- **Signal**: Observable online behavior that may predict something meaningful before it becomes obvious. Not a mention count.
- **Evidence packet**: Normalized unit of proof from any source (Reddit post, GitHub repo, search trend, etc.) with provenance metadata.
- **Corroboration**: Validation layer that tests candidate signals against independent evidence paths. Discovery and corroboration are separate.
- **Source node**: A data producer (Reddit, HN, GitHub, Polymarket, etc.) that can be enabled/disabled. The system tracks what each source contributes.
- **Signal dimensions**: Volume, velocity, acceleration, specificity, actor quality, cross-community spread, intent, durability.
- **Signal types**: Demand, frustration, adoption, comparison, narrative, coordination, economic, expectation, capital-market, status.

## Architecture Principles

- Fixture-driven first. Prove the product shape before depending on live APIs.
- Evidence-first UI. Every interpretation backed by visible source material.
- Rank by change, not raw popularity.
- Intent over sentiment. What are users trying to do matters more than how they feel.
- Transparent scoring. No black-box trend scores. Every score must be explainable.
- Missing evidence is evidence. If expected supporting data is absent, surface that.
- Independence > volume. One Reddit thread + rising search + GitHub activity > ten Reddit posts in related subs.

## Working With This Repo

### Dashboard prototype
```bash
# Just open in browser — no server needed
open dashboard-prototype/index.html

# Pull live Reddit data (requires network)
node dashboard-prototype/tools/pull-reddit-search.mjs
```

### Fixtures
- `reddit-category-pain-radar.fixture.js` — main replay scenarios
- `reddit-live-search.fixture.js` — output from live pull
- `reddit-live-search.config.json` — pull configuration

### PDF generation
Follow the global CLAUDE.md rules for HTML-to-PDF via Playwright. The project already has a reference PDF at `Signals · Radar.pdf`.

## File Organization

| Path | Purpose |
|---|---|
| `PROJECT_BRIEF.md` | Full product vision and signal taxonomy |
| `SOURCE_INTELLIGENCE.md` | Multi-platform source interpretation framework |
| `dashboard-prototype/` | Working static prototype |
| `research/producers/` | Per-platform API/access research (20+ sources) |
| `research/corroboration-engine/` | Validation engine design |
| `research/system-architecture/` | System design docs |
| `02 Projects/Signal/` | Implementation workspace, roadmap, role index |
| `role-prompts/` | Builder role definitions (7 roles) |
| `linear/` | Linear project management plan |
| `output/` | Generated artifacts (screenshots, PDFs) |

## What NOT To Build Yet

- Production infrastructure, deployment, CI/CD
- Live connectors beyond Reddit (until fixture loop is proven)
- ML models (start with transparent heuristics)
- User auth, multi-tenancy
- Generic social listening features (word clouds, sentiment dashboards, influencer rankings)

## Style

- Evidence packets use `url: "#"` for synthetic/fixture data — never fake real URLs.
- Charts are custom SVG/HTML, no charting library yet.
- Design direction comes from `Signals · Radar.pdf`.
