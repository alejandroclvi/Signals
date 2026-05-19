# Signals — Flow Simplification Audit

> A tool is real when a non-technical user can run it, understand the output, and know what to do next. This report describes the gap between Signals' current operating surface and that bar, plus the recommended terminology for the simplification.

## Snapshot of what exists today

| Surface | State | Audience clarity |
|---|---|---|
| `README.md` at repo root | **Missing** | No entry point for anyone. |
| `CLAUDE.md` | Present, 241 lines | Mixes user docs, agent docs, and stale state ("Pre-MVP local PoC", references to `dashboard-prototype/`). |
| `PROJECT_BRIEF.md` | 654 lines | Excellent product thesis; not actionable. |
| `SOURCE_INTELLIGENCE.md` | 1,143 lines | Deep producer manual; far too long for newcomers. |
| `IMPLEMENTATION_PLAN.md` | 378 lines | Internal roadmap; should not be the first thing seen. |
| `docs/UNIFIED_DATA_FLOW.md` | 382 lines | Strong but assumes the reader already understands flows + tables. |
| `docs/runbooks/` | 1 file | The only purpose-built operator runbook (token bible for one source). |
| `package.json` scripts | 19 commands | No flagged "happy path" — `start`, `dev`, `seed`, `ingest`, `brief`, `research`, `flow`, …  |
| `.env.example` | **Missing** | OpenRouter API key is a hidden prerequisite. |
| Dashboard UI labels | "Signal Radar / Signal Inbox / Evidence Coverage / Source Nodes / What To Enable Next" | Jargon-dense. |
| Context-creation modal | "thesis / avatar / state-targeted research passes" | Assumes ad-framework vocabulary. |
| Sidebar | Has fake "Maya K. / Harbor Research" account block | Confusing for a solo founder running locally. |
| Server startup message | `Signals running at http://localhost:3000` | Doesn't tell you which page to open, doesn't surface missing `.env`. |
| Error responses | Generic `"Internal server error"` / `"Something went wrong. Check the server logs."` | Non-actionable. |

---

## Current journeys

### Current user journey (non-technical)

1. Clones / opens the repo.
2. **Stops at step 2.** No README. No "start here". Has to grep `package.json` for scripts.
3. Runs `pnpm install` (guessing).
4. Runs `pnpm dev` (more guessing). Server starts on `:3000`, which on this machine collides with another app — silently confusing.
5. Hits `http://localhost:3000` — sees the dashboard but doesn't know:
   - what a "context" is
   - what the radar bubble axes mean
   - what "Ranked / New / Saved" tabs are
   - why "Source Nodes" need to be toggled
   - what "What To Enable Next" means
6. Tries to click "+ New context" → modal asks for **topic / thesis / avatar / state-targeted research passes**. Bounces.
7. Cannot tell whether the data shown is real or seeded fixtures.

**Where they get stuck:** between step 2 (where to start) and step 6 (what to write in the modal).

### Current agent journey (coding/research subagent)

1. Reads `CLAUDE.md` — gets a partial picture but is told the system is "Pre-MVP local PoC".
2. Discovers `PROJECT_BRIEF.md`, `SOURCE_INTELLIGENCE.md`, `IMPLEMENTATION_PLAN.md`, `UNIFIED_DATA_FLOW.md`, plus seven `02 Projects/Signal/Implementation Workspace/*.md` files. Reads everything to assemble the model — token-expensive.
3. Has to grep across `flows/`, `src/flows/steps/`, `scripts/` to map commands to behavior. The flow runner is documented only in `UNIFIED_DATA_FLOW.md`.
4. Finds two `signal-cases` modules, two `ingest-discovered` scripts, both `flows/` (legacy) and `src/flows/` (current). Easy to patch in the wrong place.
5. Knows there's a smoke test but has to find it (`pnpm test:smoke`).
6. Cannot cite evidence in its outputs because the convention for packet/thread/signal IDs isn't documented (other than in the new `SIGNAL_AGENT_MVP_PATCH_PLAN.md`).

**Where it gets stuck:** the orientation step. The agent currently spends large context on rediscovery rather than getting to work.

---

## Confusing concepts (jargon → translation)

| Current term | Surface | What it actually is | Recommended plain term |
|---|---|---|---|
| **Context** | DB table, UI selector, CLI flag | A topic/audience the user is monitoring | **Topic** or **Watch** |
| **Source node** | Control plane | A producer (Reddit, GitHub, …) the user can turn on for this context | **Source** or **Producer** |
| **Evidence packet** | API, schema | One observation (Reddit post, GH commit, market price) | **Observation** or just **packet** in detailed views |
| **Signal** | Everywhere | A claim ("people are switching from X to Y") | **Signal** (keep — this is the product) |
| **Unified signal** | New section in detail pane | A cross-layer thesis built from multiple sources | **Cross-source thesis** or **Thesis** |
| **Layer** / **Evidence layer** | Detail pane chips | One of 7 independent ways to see the same topic | **Source kind**: *Conversation · Search · Building · Forecasts · Hiring · Markets · Truth* |
| **Lens** | `/lens/:name` page | A goal (ads, content, product, …) that re-ranks signals | **Use case** or **Goal** |
| **Lifecycle state** | New badge | Where the signal is in its arc | **Stage**: *forming → emerging → fresh → mature → fading* |
| **Case** | New compare drawer | A group of signals about the same underlying phenomenon | **Group** or **Cluster** |
| **Awareness level** | Filter | Where the writer is in the buyer journey | Keep — already understood by marketers |
| **Desire type** | Filter / signal field | Whether the desire is instinctive or technological (ad-framework jargon) | **Demand type** + tooltip |
| **Research pass** | Context-creation modal | A scheduled batch of search queries | Hide behind "Advanced" |
| **Thesis / avatar** | Context modal | Hypothesis + persona | Replace with simple prompts: "What are you watching?" and "Who would care?" |
| **Source node state** (`enabled / available / gated`) | Control plane | Producer on / off / locked | "On / Available / Coming soon" |
| **Recommendations** ("What To Enable Next") | Control plane | Suggested producers ranked by expected lift | "Add another angle" with explanation |

---

## Confusing concepts (operator-facing)

- **"Local PoC"** appears in `CLAUDE.md` despite the repo now having 11 active contexts, 23K evidence packets, 29 unified signals, 30 cases, agent modes, lifecycle, lenses, weekly cadence. The framing is dishonest about the system's current capability.
- **"Refresh"** vs **"Ingest"** vs **"Discover"** vs **"Deepen"** vs **"Research"** vs **"Analyze"** vs **"Reclassify"** vs **"Theme labels"** — eight verbs, mostly undocumented in UI. No mental model for when to use which.
- **The radar bubble chart** uses Relevance × Momentum axes that are never labelled on the screen.
- **"Signal Inbox" tabs** (`Ranked / New / Saved`) — "Ranked" and "New" overlap; ambiguous.

---

## Unnecessary steps in the happy path

| Step | Why it's unnecessary | Fix |
|---|---|---|
| Manual `pnpm install` + `pnpm migrate` + `pnpm seed` | Three commands the user must run in order. | Add `pnpm setup`. |
| Knowing to run `pnpm seed` before `pnpm dev` | Without seed data the dashboard is empty and confusing. | Add `pnpm demo` that does setup + seed + start in one go. |
| Choosing between `pnpm research`, `pnpm ingest`, `pnpm thread-intel`, `pnpm flow run weekly-cadence` | All overlap. | Define a single happy-path command per intent. |
| Knowing OpenRouter is required for LLM features | Only fails at runtime with a generic error. | Add `.env.example`, surface "missing key" with a clear hint. |
| Knowing which context to open | The radar opens on whichever context is alphabetically first. | Open on the context with the most recent activity. |
| Reading 3,800 lines of `.md` to understand what to type into the New Context modal | The modal asks for the wrong things. | Make the modal take *just* a topic. Derive thesis/avatar/queries behind the scenes (this already works via `/api/contexts/from-topic`). |

---

## Hidden prerequisites

1. **Node 22.** `.nvmrc` says `22.12.0`; nothing tells the user this if they don't `nvm use`.
2. **`OPENROUTER_API_KEY` in `.env`.** Required for: LLM classification, thread intelligence, research briefs, unified signals. Not surfaced at start-up.
3. **Port 3000.** No way to discover the port is busy without checking the log; no fallback.
4. **`pnpm migrate` before first run.** Implicit. The dev server doesn't auto-migrate.
5. **`pnpm seed` to see anything.** Otherwise the dashboard is empty.
6. **Playwright Chromium for live discovery.** `npx playwright install chromium` is mentioned only in `CLAUDE.md`.
7. **Neo4j (`bolt://localhost:7687`).** The graph-scorer silently falls back when absent, but `pnpm graph:sync` and several flows assume it.

---

## Missing run commands

- **`pnpm setup`** — install + migrate + seed in one shot.
- **`pnpm demo`** — setup + start with a sample context already opened.
- **`pnpm doctor`** — verify Node version, `.env`, port availability, optional Neo4j.
- **`pnpm brief:unified <context>`** — convenient alias for `pnpm flow run unify-signals --context <ctx>`.
- **`pnpm stop`** — find and kill the running server (the user often forgets which port).

---

## Missing explanations

- The 7 evidence layers, in plain language, with one-line examples.
- What "corroboration score" means (it's 0..1; nobody is told that).
- What "early / current / late" means in time terms.
- What happens after I click "Save" on a signal.
- What the difference is between a *signal* and a *unified signal*.
- Where the markdown briefs live on disk (`output/*.md`).

---

## Missing defaults

- **First-time open** could ship with a fixture context already loaded (`market-signals` exists and is seeded). It does — but the user doesn't know this.
- **The "+ New context" modal** could pre-fill an example topic.
- **The radar bubble** could open the highest-corroboration signal selected.

---

## Workflows that should become one-click / one-command

| Workflow | Current state | One-command form |
|---|---|---|
| First-time setup | 3 commands, undocumented | `pnpm setup` |
| Open the demo | 4 commands | `pnpm demo` |
| Pull fresh data + score + brief | `pnpm flow run weekly-cadence --context X` then `pnpm flow run unify-signals --context X` (and tribal knowledge that you should also run `pnpm research X` first) | `pnpm refresh <context>` (chain of: research → unify) |
| Read the latest brief | Open `output/unified-<ctx>-<asOf>.md` | "Open latest brief" button in the dashboard |
| Verify health | `pnpm test:smoke` | Keep — it's already one command |

---

## Lowest-friction MVP path

```
# Step 1 — once
pnpm setup              # install deps, run migrations, seed sample data
cp .env.example .env    # then paste OPENROUTER_API_KEY

# Step 2 — every time
pnpm dev                # opens http://localhost:3000 (or PORT)
                        # the startup banner tells you which page to open

# Step 3 — to update a topic with fresh evidence + brief
pnpm refresh <context>  # research, link, score, unify, brief — single command

# Step 4 — to see if things are healthy
pnpm test:smoke
```

---

## Recommended terminology table (consolidated)

| In docs (today) | In docs (recommended) | Why |
|---|---|---|
| Context | **Topic** in human docs · *context* kept as the technical id | Match how a founder thinks |
| Source node | **Source** | Producer/connector is engineer-language |
| Evidence packet | **Observation** in human docs · *packet* in agent docs | One word per audience |
| Signal | **Signal** | Already understood |
| Unified signal | **Cross-source thesis** | Reads what it is |
| Lens | **Goal** | Lens has no meaning to a non-engineer |
| Layer | **Source kind** (Conversation, Search, Building, Forecasts, Hiring, Markets, Truth) | Concrete |
| Lifecycle state | **Stage** | Reads what it is |
| Case / signal case | **Group** | Reads what it is |
| Thesis | **Hypothesis** in modal · *thesis* in research brief | Less academic for the modal |
| Avatar | **Audience** in modal · *avatar* in research brief | Less marketing-y for the modal |

---

## Severity rollup

- **P0** (blocks adoption): missing `README.md`, missing `.env.example`, jargon-dense context modal, no happy-path command.
- **P1** (causes friction): UI labels ("Source Nodes", "What To Enable Next"), generic error messages, no `pnpm doctor`, fake "Maya K." sidebar account.
- **P2** (polish): radar axes labelling, lens → "Goal" rename, sidebar account block removal, fade-out of legacy `CLAUDE.md` framing.

These map to the work packages in `FLOW_SIMPLIFICATION_PATCH_PLAN.md`.
