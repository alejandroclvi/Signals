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

### Running the app
```bash
pnpm install
pnpm dev                  # Express server on http://localhost:3000
```

### CLI scripts
```bash
pnpm ingest               # Pull live Reddit data into pipeline
pnpm thread-intel --context <id>   # Run LLM thread analysis
pnpm research <id>                 # Autonomous adaptive research loop (3 rounds)
pnpm research <id> --assess        # Assess coverage gaps (no discovery)
pnpm research <id> --queries       # Generate adaptive queries (dry run)
pnpm research <id> --after 2026-04-14                    # Only posts after date
pnpm research <id> --after 2026-04-14 --before 2026-04-21  # Time window
pnpm backfill                      # Backfill NULL classifications on existing evidence
pnpm reclassify <id>               # Upgrade regex classifications to LLM
pnpm theme-labels <id>             # Generate LLM-derived theme labels
pnpm brief --context <id>          # Generate research brief
pnpm push --context <id>           # Generate brief + push to dashboard as modal
pnpm push --toast "message"        # Send toast notification to dashboard
pnpm push --reload                 # Trigger data reload in dashboard
pnpm test:smoke                    # Run health checks (DB, evidence, signals, relevance)
```

### Adaptive research loop
The system can autonomously direct its own research. Instead of static queries:

1. **Assess** — analyze evidence distribution, identify coverage gaps (e.g., 2% tried_failed vs 16% target)
2. **Generate** — LLM creates targeted queries using vocabulary from existing evidence
3. **Discover** — Chrome discovery with adaptive queries
4. **Classify** — LLM micro-classifier upgrades regex classifications inline
5. **Reassess** — check if gaps improved, decide to continue or stop

```bash
pnpm research <context-id>           # Full loop (3 rounds)
pnpm research <context-id> --assess  # Just show coverage gaps
pnpm research <context-id> --after 2026-04-14  # Only recent evidence
```

The research director also checks thesis validity — if evidence contradicts the hypothesis, it flags for refinement.

### Time window boundaries
All ingestion and research commands accept optional `--after` and `--before` flags (ISO date format: YYYY-MM-DD). These are not included by default — without them, the system searches all time.

- **Google discovery**: Appends `after:` / `before:` to Google search queries
- **Reddit fetcher**: Converts dates to Reddit's `t=` param (day/week/month/year) for server-side filtering, then applies precise client-side filtering on `created_utc`
- **Interactive discovery**: Adds date operators to the headed browser's Google searches
- **API**: Pass `afterDate` / `beforeDate` in request body

```bash
# CLI
pnpm research <id> --after 2026-04-14 --before 2026-04-21
pnpm ingest -- --context <id> --after 2026-04-14
node scripts/discover-reddit-threads.mjs --context <id> --after 2026-04-14

# API
curl -X POST localhost:3000/api/ingest/reddit \
  -H 'Content-Type: application/json' \
  -d '{"context_id": "<id>", "afterDate": "2026-04-14"}'
```

### Intelligence pipeline
The system has a 3-layer intelligence architecture:

1. **Pipeline** (regex, heuristic) — `pnpm ingest` runs 4-stage pipeline: collect → classify → extract → validate
2. **Thread intelligence** (LLM) — `pnpm thread-intel` reconstructs Reddit threads, sends to Gemini Flash via OpenRouter, reconciles with regex
3. **Research brief** (LLM) — `pnpm brief` generates structured research briefs from evidence or topic hypothesis

### Agent → Dashboard communication (SSE)
The dashboard accepts real-time events via Server-Sent Events. Any agent or script can push to the UI:

```bash
# Toast notification
curl -X POST localhost:3000/api/toast -H 'Content-Type: application/json' \
  -d '{"message": "Analyzing threads...", "type": "info"}'

# Intelligence report (opens modal)
curl -X POST localhost:3000/api/report -H 'Content-Type: application/json' \
  -d '{"title": "Research Brief", "body": "## Thesis\n...", "format": "markdown"}'

# Trigger data reload
curl -X POST localhost:3000/api/reload
```

The UI listens on `GET /api/events` (EventSource). Events: `toast`, `report`, `reload`.

### Triggering intelligence from the dashboard
- Click the **Analyze** button on any signal detail → runs thread intelligence for that signal's threads, reconciles, refreshes scores, pushes results via SSE
- `POST /api/signals/:id/analyze` — API endpoint for programmatic trigger
- `GET /api/signals/:id/intelligence` — read thread intelligence for a signal

### Fixtures
- `dashboard-prototype/fixtures/` — replay data for law firms and founder AI tools scenarios
- Seeds: `pnpm seed`, `pnpm seed:market`, or `pnpm seed:all`

### Environment
- `.env` in project root with `OPENROUTER_API_KEY=sk-or-...` (required for LLM features)
- Node 22 required — `.nvmrc` and `package.json engines` are pinned (`nvm use`)

### Smoke test
`pnpm test:smoke` validates database health across 44 checks:
- All contexts have queries and source nodes
- All evidence has `source_kind` (post, comment, market_prediction, market_price)
- No evidence from irrelevant communities (relevance score ≤ 0.2)
- No orphaned signals (signals without linked evidence)
- No duplicate ranks per context
- Market fixtures seeded and intact
- No failed pipeline runs

### Evidence contract
Every evidence packet has:
- `source_kind` — explicit type: `post`, `comment`, `market_prediction`, `market_price` (future: `search_result`, `repo`, `review`)
- `evidence_state` — buyer journey position: `experiencing_pain`, `seeking`, `tried_failed`, `found_what_works`, `sharing_insight`, `warning`, `comparing`, `promoting`
- `intent`, `awareness_level`, `sentiment` — legacy 3-dimension classification (still populated)
- `evidence_weight` — upvote-based weight (comments: 0.6x–2.6x, posts: 1.0x–2.0x)
- `quality_score` — combined relevance + intent + awareness + weight score

### Community relevance
The classify stage drops evidence from irrelevant communities (score ≤ 0.2). Relevance tiers:
- **1.0** — business, tech, marketing, professional (SaaS, startups, programming, etc.)
- **0.5** — career, work-adjacent (careerguidance, personalfinance, etc.)
- **0.2** — finance noise, general AI chat (stocks, ChatGPT, wallstreetbets, etc.) — **filtered out**
- **0.1** — hobbies, fiction, gaming, relationships — **filtered out**
- **0.5** — unknown communities get a chance

### Sending notifications to the dashboard

When running multi-step workflows (ingestion, thread intelligence, research briefs, or any long-running task), send toast notifications to the dashboard so the user can see progress in real time. Use curl from Bash:

```bash
# Info toast
curl -s -X POST http://localhost:3000/api/toast -H 'Content-Type: application/json' -d '{"message": "Step 1: Pulling evidence from Reddit...", "type": "info"}'

# Error toast
curl -s -X POST http://localhost:3000/api/toast -H 'Content-Type: application/json' -d '{"message": "Ingestion failed: rate limited", "type": "error"}'

# Push a report modal (markdown)
curl -s -X POST http://localhost:3000/api/report -H 'Content-Type: application/json' -d '{"title": "Analysis Complete", "body": "## Summary\n...", "format": "markdown"}'

# Trigger data reload
curl -s -X POST http://localhost:3000/api/reload -H 'Content-Type: application/json' -d '{}'
```

**Always notify the user** at each meaningful step: starting a task, progress updates, completion, and errors. The dashboard must be running (`pnpm dev`) for notifications to appear.

### PDF generation
Follow the global CLAUDE.md rules for HTML-to-PDF via Playwright. The project already has a reference PDF at `Signals · Radar.pdf`.

## File Organization

| Path | Purpose |
|---|---|
| `src/pipeline/` | 4-stage ingestion pipeline + thread intelligence + reconciliation |
| `src/agents/` | Research brief agent (OpenRouter) |
| `src/routes/api.mjs` | REST API (signals, evidence, ingest, analyze, intelligence) |
| `src/routes/sse.mjs` | Server-Sent Events (toast, report, reload) |
| `src/routes/pages.mjs` | HTML routes (dashboard, evidence, watchlist, communities) |
| `src/views/` | EJS templates |
| `src/public/` | Frontend JS + CSS (vanilla, no framework) |
| `src/lib/env.mjs` | Shared .env loader |
| `src/pipeline/research-director.mjs` | Adaptive research loop: coverage assessment, query generation, thesis checking |
| `src/pipeline/llm-classifier.mjs` | Batched LLM micro-classification via Gemini Flash (replaces regex) |
| `src/pipeline/theme-labeler.mjs` | LLM-derived theme labels for research queries |
| `scripts/` | CLI tools (ingest, thread-intel, brief, push-report, research, backfill, reclassify, smoke-test) |
| `src/pipeline/community-relevance.mjs` | Community relevance scoring (filters noise communities) |
| `PROJECT_BRIEF.md` | Full product vision and signal taxonomy |
| `SOURCE_INTELLIGENCE.md` | Multi-platform source interpretation framework |
| `dashboard-prototype/` | Legacy static prototype (superseded by Express app) |
| `research/` | Producer viability, corroboration engine, system architecture |
| `02 Projects/Signal/` | Implementation workspace, roadmap, progress reports |
| `linear/` | Linear project management plan |

## What NOT To Build Yet

- Production infrastructure, deployment, CI/CD
- ML models (start with transparent heuristics + LLM-assist)
- User auth, multi-tenancy
- Generic social listening features (word clouds, sentiment dashboards, influencer rankings)

## Style

- Evidence packets use `url: "#"` for synthetic/fixture data — never fake real URLs.
- Charts are custom SVG/HTML, no charting library yet.
- Design direction comes from `Signals · Radar.pdf`.
- Toast notifications via `showToast(message, isError)` in app.js.
- Reports pushed via SSE render as markdown in a modal overlay.
