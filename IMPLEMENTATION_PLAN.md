# Signals MVP — Implementation Plan

Generated: 2026-04-19
Author: Claude Opus 4.6

---

## Architecture Decisions

### Rendering: Server-rendered pages + vanilla JS

The prototype is 2,607 lines of static HTML with vanilla JS `innerHTML` rendering. It works. One user, no SEO, no real-time requirements. The right move is to keep what works and add a server behind it.

Express serves HTML pages and injects initial data as a JSON blob (exactly like the current fixture approach using `window.signalRadarFixtures`). The client-side JS stays vanilla — all the render functions (`renderMetrics`, `renderBubbleChart`, `renderSignalList`, etc.) remain unchanged.

**Why not React/Next.js/Svelte?** Converting 2,607 lines of working vanilla HTML/JS to components would take weeks and produce zero user-visible improvement. The app has ~4 views total. Framework overhead (build tooling, state management, bundler config) adds complexity with no payoff at this stage.

### Framework: Express + EJS

- Express is already in the Node.js ecosystem (existing tools are `.mjs`)
- EJS templates split the monolithic HTML into partials while keeping the exact same markup and CSS
- Zero build step. No bundler, no transpiler, no HMR config
- If the project outgrows this, migrating to a framework later is straightforward because the data model and API will already be clean

### Database: SQLite via better-sqlite3

- Single-user local PoC. No server process, no connection pooling, no Docker
- `better-sqlite3` is synchronous and fast for reads — perfect for a dashboard
- The data model is relational. JSON files would require reimplementing queries
- SQLite supports JSON functions (`json_extract`, `json_each`) for semi-structured fields
- Migration path to Postgres later is straightforward

### Dependencies (total: 3)

```
express
ejs
better-sqlite3
```

That's it. No build tools, no bundler, no framework runtime.

---

## Data Model

### `contexts` — monitoring contexts

```sql
CREATE TABLE contexts (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT,
  subreddits    TEXT,  -- JSON array
  queries       TEXT,  -- JSON array
  high_intent   TEXT,  -- JSON array
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
```

### `evidence_packets` — normalized source evidence

```sql
CREATE TABLE evidence_packets (
  id            TEXT PRIMARY KEY,  -- e.g. "reddit:query-id:source-item-id"
  context_id    TEXT REFERENCES contexts(id),
  source_id     TEXT NOT NULL,     -- e.g. "reddit"
  source_layer  TEXT,              -- e.g. "conversation"
  source_item_id TEXT,
  url           TEXT,
  title         TEXT,
  body          TEXT,
  author_ref    TEXT,
  community     TEXT,
  observed_at   TEXT,
  published_at  TEXT,
  metrics       TEXT,  -- JSON: {score, comments, upvote_ratio}
  topics        TEXT,  -- JSON array
  raw_ref       TEXT,
  content_hash  TEXT
);
```

### `signals` — candidate and validated signals

```sql
CREATE TABLE signals (
  id              TEXT PRIMARY KEY,
  context_id      TEXT REFERENCES contexts(id),
  rank            INTEGER,
  status          TEXT,    -- Emerging, Growing, Watch, Steady, Fading
  title           TEXT NOT NULL,
  growth          TEXT,
  tags            TEXT,    -- JSON array
  summary         TEXT,
  communities     TEXT,    -- JSON array
  mentions        INTEGER,
  comments        INTEGER,
  confidence      TEXT,    -- High, Medium, Low
  volume          INTEGER,
  why             TEXT,
  suggested_title TEXT,
  suggested_sub   TEXT,
  next_source     TEXT,
  bubble_x        REAL,
  bubble_y        REAL,
  bubble_r        REAL,
  first_detected  TEXT,
  last_seen       TEXT,
  dismissed       INTEGER DEFAULT 0,
  saved           INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
```

### `signal_evidence` — join table

```sql
CREATE TABLE signal_evidence (
  signal_id    TEXT REFERENCES signals(id),
  evidence_id  TEXT REFERENCES evidence_packets(id),
  PRIMARY KEY (signal_id, evidence_id)
);
```

### `signal_phrases` — detected phrases per signal

```sql
CREATE TABLE signal_phrases (
  signal_id TEXT REFERENCES signals(id),
  phrase    TEXT,
  count     INTEGER
);
```

### `signal_spread` — community spread per signal

```sql
CREATE TABLE signal_spread (
  signal_id   TEXT REFERENCES signals(id),
  community   TEXT,
  percentage  INTEGER
);
```

### `source_nodes` — source node registry and state

```sql
CREATE TABLE source_nodes (
  id          TEXT PRIMARY KEY,
  context_id  TEXT REFERENCES contexts(id),
  name        TEXT NOT NULL,
  state       TEXT DEFAULT 'available',  -- enabled, available, gated
  layers      TEXT,    -- JSON array
  lift        INTEGER,
  adds        TEXT,
  cannot      TEXT
);
```

### `scoring_runs` — audit trail for transparency

```sql
CREATE TABLE scoring_runs (
  id         TEXT PRIMARY KEY,
  signal_id  TEXT REFERENCES signals(id),
  run_at     TEXT DEFAULT (datetime('now')),
  components TEXT,  -- JSON: array of [label, value] pairs
  total      INTEGER
);
```

### `timeline_snapshots` — periodic aggregates

```sql
CREATE TABLE timeline_snapshots (
  context_id    TEXT REFERENCES contexts(id),
  snapshot_date TEXT,
  posts         INTEGER,
  comments      INTEGER,
  authors       INTEGER,
  PRIMARY KEY (context_id, snapshot_date)
);
```

---

## API Shape

```
GET  /                                -- radar dashboard (HTML page)
GET  /signal/:id                      -- signal detail (HTML page)

GET  /api/contexts                    -- list monitoring contexts
GET  /api/contexts/:id/radar          -- full radar data (signals, metrics, timeline, heatmap, intent, source nodes)
GET  /api/signals/:id                 -- signal detail with evidence, phrases, spread, scores
GET  /api/signals/:id/evidence        -- paginated evidence packets
POST /api/signals/:id/dismiss         -- dismiss a signal
POST /api/signals/:id/save            -- save a signal
POST /api/source-nodes/:id/toggle     -- enable/disable a source node
POST /api/ingest/reddit               -- trigger a Reddit pull
GET  /api/fixtures                    -- list available fixtures
POST /api/fixtures/:id/replay         -- replay a fixture into SQLite
```

---

## Project Structure

```
signals/
  package.json
  CLAUDE.md
  PROJECT_BRIEF.md
  IMPLEMENTATION_PLAN.md

  src/
    server.mjs                        -- Express entry point
    db/
      schema.sql                      -- SQLite schema (above)
      migrate.mjs                     -- run schema, seed source nodes
      connection.mjs                  -- better-sqlite3 singleton
    routes/
      api.mjs                         -- REST API routes
      pages.mjs                       -- HTML page routes
    views/
      layout.ejs                      -- outer shell (head, sidebar, topbar)
      partials/
        sidebar.ejs
        topbar.ejs
        metric-strip.ejs
        control-plane.ejs
        signal-list.ejs
        detail-pane.ejs
        bubble-chart.ejs
    pipeline/
      fetchers/
        reddit.mjs                    -- fetch from Reddit API
        fixture.mjs                   -- load fixture files
      normalizer.mjs                  -- raw data -> evidence packets
      signal-extractor.mjs            -- evidence packets -> candidate signals
      scorer.mjs                      -- transparent heuristic scoring
      recommender.mjs                 -- source enablement recommendations
      ingest.mjs                      -- orchestrate full pipeline
    public/
      app.js                          -- client-side JS (extracted from prototype)
      style.css                       -- CSS (extracted from prototype)

  fixtures/                           -- moved from dashboard-prototype/fixtures
    reddit-category-pain-radar.fixture.js
    reddit-live-search.fixture.js
    reddit-live-search.config.json

  scripts/
    seed-fixtures.mjs                 -- replay fixtures into SQLite for first run

  dashboard-prototype/                -- preserved as reference
    index.html
```

---

## Migration Path from Prototype

The prototype is one 2,607-line file. Here's the extraction:

### Step 1: CSS → `src/public/style.css`
Copy the entire `<style>` block. No changes. The CSS uses custom properties and has zero framework dependencies.

### Step 2: HTML → EJS partials
The body splits naturally:
- `layout.ejs` — `<div class="app">` wrapper with grid
- `sidebar.ejs` — brand, context select, nav, account
- `topbar.ejs` — breadcrumbs, title, search, fixture select, actions
- `metric-strip.ejs` — `<div id="metrics">` container
- `control-plane.ejs` — evidence ladder, source nodes, recommendations
- `signal-list.ejs` — bubble chart + signal list
- `detail-pane.ejs` — signal detail + sidebar

Each partial keeps the same DOM IDs. Client JS continues to target them by ID.

### Step 3: JS → `src/public/app.js`
The `<script>` block becomes `app.js`. One change — instead of inline fixture data, the page injects a JSON blob:

```html
<!-- In layout.ejs -->
<script>window.__SIGNALS_DATA__ = <%- JSON.stringify(radarData) %>;</script>
<script src="/app.js"></script>
```

All render functions stay exactly as they are.

### Step 4: Wire interactions to API
`toggleNode` adds a `fetch('POST /api/source-nodes/:id/toggle')` before updating UI. Search filter stays client-side.

**Result: every pixel preserved.** No CSS rewrite, no component framework, no visual regression risk.

---

## Build Order

### Phase 1: Skeleton (Week 1–2)

**Deliverable:** The existing prototype UI served from Express, reading from SQLite.

1. `npm init`, install `express`, `ejs`, `better-sqlite3`
2. Create `schema.sql` and `migrate.mjs`
3. Create `connection.mjs` (better-sqlite3 singleton)
4. Write `seed-fixtures.mjs` — reads existing fixture, inserts into SQLite
5. Extract CSS → `style.css`
6. Extract HTML → EJS partials
7. Extract JS → `app.js`
8. Create page route: `GET /` queries SQLite, renders radar
9. Create API route: `GET /api/contexts/:id/radar`
10. **Verify:** `localhost:3000` shows the same UI as the static prototype

### Phase 2: Pipeline (Week 3–4)

**Deliverable:** Evidence flows from Reddit (live or fixture) through a pipeline into SQLite and appears on the dashboard.

1. Refactor `pull-reddit-search.mjs` → `fetchers/reddit.mjs` + `normalizer.mjs`
2. Build `fetchers/fixture.mjs`
3. Build `ingest.mjs` (fetch → normalize → write to `evidence_packets`)
4. `POST /api/ingest/reddit` route
5. Add "Refresh" button to dashboard
6. `POST /api/fixtures/:id/replay` route
7. **Verify:** clicking Refresh pulls live Reddit data and the dashboard shows it

### Phase 3: Signal Extraction + Scoring (Week 5–6)

**Deliverable:** Auto-generated signals from evidence packets with transparent scores.

1. `signal-extractor.mjs` — group evidence by topic/query, count mentions, authors, communities, compute growth
2. `scorer.mjs` — implement the score components already in the prototype (Repetition, Pain intensity, Cross-community, Tool request, Engagement quality, Freshness, Missing evidence penalty)
3. `recommender.mjs` — port the existing `recommendationScore`/`recommendationReason` functions
4. Extend `ingest.mjs`: fetch → normalize → extract → score → recommend → write
5. Write `scoring_runs` for audit trail
6. **Verify:** replay a fixture, see auto-generated signals with scores

### Phase 4: Interactivity + Polish (Week 7–8)

**Deliverable:** Demo-ready application.

1. Wire `POST /api/source-nodes/:id/toggle` (persist + recalculate recommendations)
2. Wire `POST /api/signals/:id/save` and `/dismiss`
3. Context switching via `GET /api/contexts`
4. Simple "New context" form
5. Periodic refresh (`setInterval` on server, configurable)
6. Loading states, error handling, empty states
7. Evidence library view (`GET /evidence` page)
8. **Final demo:** create context → pull Reddit → see signals → inspect evidence → toggle sources → see recommendations change → save evidence

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Reddit API rate limits during demo | Fixture replay always works offline. Seed rich fixture data for both scenarios. |
| Signal extraction too naive | The prototype already shows "good enough." Start by reproducing existing fixture signals, then iterate. |
| Scope creep into multiple sources | Architecture supports it, but MVP builds only the Reddit fetcher. Other sources stay "available" or "gated" in UI. |
| Monolithic HTML extraction breaks something | Do it in Phase 1 and verify pixel-match before moving on. Keep prototype as reference. |

---

## What This Plan Does NOT Include

- User auth / multi-tenancy
- Production deployment / hosting
- CI/CD
- ML models (heuristics only)
- Sources beyond Reddit
- Mobile/responsive layout
- Automated tests (manual verification per phase)

These are all valid future work. They are not MVP.
