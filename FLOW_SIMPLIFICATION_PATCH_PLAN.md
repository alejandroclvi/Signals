# Signals — Flow Simplification Patch Plan

> Nine ordered work packages. Each has a target audience, a single done criterion, and a list of files to touch. No new tables, no new framework. Companion to `FLOW_SIMPLIFICATION_REPORT.md`.

| # | Package | Audience | Done when |
|---|---|---|---|
| 1 | Human workflow simplification | non-technical operator | One command (`pnpm demo`) gets them from clone to a live dashboard with seeded data |
| 2 | Agent workflow simplification | coding/research agent | `AGENT_README.md` tells the agent which file to edit for any change |
| 3 | README for non-technical users | non-technical operator | `HUMAN_README.md` linked from `README.md`; every step executable as-written |
| 4 | README for agents | coding/research agent | `AGENT_README.md` includes table inventory, flow runner, where to add producers/flows/UI surfaces |
| 5 | Setup/run command cleanup | both | `pnpm setup`, `pnpm demo`, `pnpm doctor`, `pnpm refresh`, `pnpm stop` exist and are documented |
| 6 | UI copy and terminology | non-technical operator | Top-level labels match the recommended terminology (Topic, Source, Stage, Goal); detail-level keeps engineer terms |
| 7 | Error / help messages | both | Startup banner surfaces missing env / port collision; `/api/` errors are actionable |
| 8 | Example demo flow | non-technical operator | A walkthrough that ships with the repo and can be replayed in 5 minutes |
| 9 | Verification | both | Re-walking each README from a fresh shell succeeds; smoke test passes |

---

## 1. Human workflow simplification

Goal: the path from `git clone` to "I can see and click on a signal" is **three commands**.

```bash
git clone … signals && cd signals
pnpm setup            # installs, migrates, seeds
pnpm demo             # starts the server and prints the URL to open
```

Implementation:
- New `pnpm setup` script: chains `pnpm install` → `pnpm migrate` → `pnpm seed:all`.
- New `pnpm demo` script: `pnpm setup && pnpm dev` plus a banner pointing the user at `http://localhost:3000/?context=market-signals`.
- New `pnpm doctor` script: checks Node version, presence of `.env`, port availability, optional Neo4j. Prints one line per check.
- `.env.example` in repo root with the **single required** env var (`OPENROUTER_API_KEY`) and a comment about how to get one.
- `src/server.mjs` startup banner upgraded to print:
  - the URL (already does)
  - the active context count (`<N> contexts loaded`)
  - missing-env warning if `OPENROUTER_API_KEY` is unset
  - port-fallback hint if `:PORT` is busy

Files touched: `package.json`, new `scripts/setup.mjs`, new `scripts/doctor.mjs`, new `.env.example`, `src/server.mjs`.

---

## 2. Agent workflow simplification

Goal: an agent can answer "where do I add a new producer?" / "what's the convention for flows?" / "how do I cite an evidence packet in my output?" without reading 4,000 lines of `.md`.

Implementation:
- `AGENT_README.md` at root — single doc, ~400 lines, every section anchored.
- Each section is a one-line answer + a code pointer (file path + grep hint).
- Convention codified: agent outputs cite packets as `[ev:<packet-id>]`, threads as `[th:<thread-id>]`, signals as `[sig:<signal-id>]`, unified signals as `[uni:<unified-id>]`. The dashboard's evidence renderer already accepts the `[ev:…]` shorthand from G-11 in the prior audit.
- `CLAUDE.md` trimmed: keep only the things that are *agent-only* and link out to `AGENT_README.md` for the canonical reference. Remove the "Pre-MVP local PoC" framing.

Files touched: new `AGENT_README.md`, edits to `CLAUDE.md`.

---

## 3. README for non-technical users

Goal: a founder/operator can open `HUMAN_README.md` and complete the eight-step desired UX without asking an engineer.

Required sections (and their done criteria):

1. **What is Signals?** — two sentences, no jargon.
2. **What it solves** — three bullets, concrete.
3. **What a signal is** — analogy + example.
4. **What evidence coverage means** — analogy + the 7 source kinds (plain names).
5. **Install (3 commands)** — copy-pasteable.
6. **Open the demo** — what to expect to see.
7. **Reading the dashboard** — annotated screenshot description (ASCII OK if no image).
8. **Opening a signal** — what each section means.
9. **Reading a brief** — where it lives, what the badges mean.
10. **Early/Current/Late** — one paragraph.
11. **What to do with an insight** — Save / Dismiss / Alert + how to share.
12. **Common errors** — table of error → fix.
13. **Walkthrough** — query → signal → evidence → insight, scripted with real commands.

Files touched: new `HUMAN_README.md`, new `README.md` (a 30-line splash that points to `HUMAN_README.md` and `AGENT_README.md`).

---

## 4. README for agents

Mirror of #3 but built for an agent's information diet. Sections in priority order:

1. **Thesis** — one paragraph, anti-pattern callouts ("not generic social listening").
2. **Data ladder** — Producer → Packet → Thread → Signal → Unified Signal, with table names.
3. **Tables you'll actually query** — short list, ~12 tables, one-line purpose each.
4. **Commands** — happy-path first, advanced after.
5. **Flow system** — what `flows/*.mjs` is, what `src/flows/steps/*.mjs` is, the runner contract.
6. **Producers** — registry path, contract, how to add one.
7. **Evidence layers** — 7 layers + their producer mapping (lifted from `UNIFIED_DATA_FLOW.md`).
8. **Dashboard routes & APIs** — every URL the agent can hit.
9. **Where to add things** — UI partial / route / flow step / pipeline stage, with file paths.
10. **Conventions** — citation tokens, ID prefixes (`live:`, `unified:`, `thread:`, `t1_`/`t3_`), SQL discipline (transactions for multi-write paths), pragma `foreign_keys=ON` means cascade is your problem.
11. **How not to break it** — list of `git status`-detectable danger signs (orphan flows, parallel signal model, etc.).
12. **How to verify** — `pnpm test:smoke` + new drilldown chain assertions.
13. **How to cite evidence** — the `[ev:…]` token convention.

---

## 5. Setup / run command cleanup

Final `scripts:` block in `package.json` after the patch:

```json
"setup": "node scripts/setup.mjs",
"demo": "pnpm setup && pnpm dev",
"doctor": "node scripts/doctor.mjs",
"dev": "node --watch src/server.mjs",
"start": "node src/server.mjs",
"stop": "node scripts/stop.mjs",

"refresh": "node scripts/refresh.mjs",      // one happy-path command per topic
"brief": "node scripts/generate-research-brief.mjs",
"brief:unified": "node scripts/flow.mjs run unify-signals --context",

"flow": "node scripts/flow.mjs",            // power user
"test:smoke": "node scripts/smoke-test.mjs",
"migrate": "node src/db/migrate.mjs",       // power user
"seed": "node scripts/seed-fixtures.mjs",   // power user
…
```

The deprecated / overlapping scripts (`ingest`, `ingest:multi`, `thread-intel`, `research`, `reclassify`, `theme-labels`, `backfill`, `graph:sync`, `push`, `report:weekly`) **stay** for backwards compatibility but get a one-line header comment in `package.json` pointing to `pnpm refresh` as the canonical wrapper.

Files touched: `package.json`, new `scripts/setup.mjs`, `scripts/doctor.mjs`, `scripts/refresh.mjs`, `scripts/stop.mjs`.

---

## 6. UI copy and terminology

**Top-level labels** get the plain-language rename. Detail-level keeps existing terms so engineer-readers aren't lost.

| Surface | Current | Replacement |
|---|---|---|
| Sidebar "Active context" | Active context | **Active topic** |
| Sidebar "+New context" tooltip | New context | **New topic** |
| Sidebar nav "Evidence Library" | Evidence Library | **Observations** |
| Sidebar nav "Communities" | Communities | **Communities** (keep — accurate) |
| Sidebar fake account block | "Maya K. / Harbor Research" | **Remove** (replace with build label like `Signals · local`) |
| Topbar crumbs | "Radar / <label>" | "Topic: <label>" |
| Topbar title | "Signal Radar" | "Signals" |
| Topbar refresh button | "Refresh" | "Refresh from sources" |
| Inbox tabs | "Ranked / New / Saved" | "Top / New / Saved" |
| Control plane "Source Nodes" | Source Nodes | **Sources** |
| Control plane "What To Enable Next" | What To Enable Next | **Add another angle** |
| Control plane state legend | Enabled / Available / Gated | On / Available / Coming soon |
| New-context modal title | New research context | **New topic** |
| Modal AI tab fields | Topic / Description | **What are you watching? / Why does it matter?** |
| Modal field hint | "The AI will generate thesis, avatar, …" | "We'll generate the search queries for you." |
| Detail pane heading | Why it matters | **Why this matters** |
| Detail pane section | Cross-layer corroboration | **Cross-source corroboration** |
| Detail pane section | Unified signals (cross-layer thesis) | **Cross-source theses** |
| Lens page label | Lens | **Goal** |

Files touched: `src/views/partials/*.ejs`, the modal in `src/public/app.js`, lens page header in `src/views/lens.ejs`.

---

## 7. Error / help messages

Replace generic error responses with actionable ones.

- **Startup banner** prints structured info. If `OPENROUTER_API_KEY` missing:

  > `⚠ OPENROUTER_API_KEY not set. LLM features (classify, thread-intel, briefs, unify) will fail. See .env.example.`

  If `:PORT` is busy:

  > `⚠ Port 3000 in use. Set PORT=3737 (or another free port) and retry, e.g.  PORT=3737 pnpm dev`

- **API error envelope** carries a `hint:` field when the error has a likely cause:

  ```json
  { "error": "Internal server error", "hint": "Did you run `pnpm migrate`? Table 'unified_signals' not found." }
  ```

- **`/api/contexts/from-topic`** specifically: if `OPENROUTER_API_KEY` is missing, return 400 with `hint: "Set OPENROUTER_API_KEY in .env"`.

- **`pnpm doctor`** output mirrors the same hints so the user can fix things before hitting them in the UI.

Files touched: `src/server.mjs`, `src/routes/api.mjs` (one handler), new `scripts/doctor.mjs`.

---

## 8. Example demo flow

A scripted demo ships with the repo and is referenced from `HUMAN_README.md`:

```bash
pnpm demo                                 # starts the server with seeded data
# in the dashboard:
#   1) sidebar → pick "Market signals"
#   2) click the largest bubble → detail pane opens
#   3) cross-source corroboration strip: click "Conversation" chip → drawer opens
#   4) sidebar → click "Cross-source theses" card → drawer opens with thesis
#   5) Save the signal → it appears in Watchlist
```

The walkthrough is replayable because `market-signals` is the smallest seeded context (4 signals, 15 packets, fixture meta intact). After a teardown (`rm data/signals.db`) the same `pnpm demo` rebuilds it. This is the "fresh shell" verification path.

---

## 9. Verification

After each package lands, run:

```bash
pnpm doctor          # env + port + Neo4j checks
pnpm test:smoke      # 107+ data integrity checks
```

End-to-end demo verification (executed as the last step of this work):

1. `rm -rf node_modules data/signals.db output/`
2. `pnpm setup`
3. `pnpm demo` — confirm the banner is correct.
4. Open the URL — confirm a context loads, a signal opens, the cross-source strip renders, clicking a layer chip opens the drawer.
5. `pnpm refresh market-signals` — confirm the command works end-to-end.
6. Re-walk `HUMAN_README.md` and `AGENT_README.md` from the top, copy-pasting every code block.

---

## Out of scope (intentional)

- No frontend framework migration.
- No new pipeline stages.
- No schema changes.
- No new producers.
- No rename of database tables or APIs (only labels and human-facing copy change).
- No removal of the legacy `flows/` (top-level) directory — that's a separate cleanup.
