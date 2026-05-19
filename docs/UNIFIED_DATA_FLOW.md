# Unified Data Flow — 7-Layer Cross-Source Synthesis

**Status:** shipped 2026-05-19. Stable.
**Entrypoint:** `pnpm flow run unify-signals --context <ctx>`
**Output:** rows in `unified_signals` + `unified_signal_evidence` tables, markdown brief at `output/unified-<ctx>-<asOf>.md`.

This document is the canonical reference for how Signals turns multi-source evidence into a single coherent brief with early/current/late temporal classification and cross-layer corroboration scoring. It replaces ad-hoc per-producer reading and gives a unified narrative-level view that an analyst (human or LLM) can act on.

---

## 1. The seven evidence layers

Each layer is one independent way the world is reacting to (or producing) the same topic. Layer agreement = corroboration; layer disagreement = contradiction worth flagging.

| # | Layer | What it tells us | Producer(s) | source_id values |
|---|---|---|---|---|
| 1 | **Conversation** | What people are saying right now | `reddit`, `hackernews` | reddit, hackernews |
| 2 | **Intent** | What people are searching for | `google` (Playwright+Chrome) | google |
| 3 | **Behavior** | What people are building / shipping | `github` | github |
| 4 | **Expectation** | What capital-staked prediction markets price the future at | `polymarket` (tag-based) | polymarket |
| 5 | **Economic commitment** | Who is hiring / paying / committing budget | `hn-hiring` | hn-hiring |
| 6 | **Capital-market response** | How public equity markets move | `yfinance`, `stocktwits`, `reddit-finance` | yfinance, stocktwits, reddit-finance |
| 7 | **Primary truth** | What the entity itself says it shipped | `anthropic` (GitHub releases) | anthropic |

The producer registry (`src/pipeline/producers/registry.mjs`) wires 10 producers across these 7 layers. All are free / no paid APIs. See [Producer-by-producer details](#5-producers-detail) below.

---

## 2. The pipeline

```
4,005 evidence packets (7 layers)
        │
        ▼
[1] discover-topics      LLM samples top-weighted evidence per layer →
                         surfaces 5–8 cross-cutting topics + key_terms
                         + temporal_hypothesis
        │
        ▼  for each topic:
[2] gather-cross-layer   Keyword-match key_terms against all 7 layers →
                         byTopic[layer] = [top-N matching packets]
        │
        ▼
[3] classify-temporal    Structural temporal hints:
                          • first_detected (earliest packet across layers)
                          • peak_at (highest-volume day, weighted)
                          • peak_layer (which layer is loudest)
                          • layer_breadth (how many of 7 carry the signal)
                          • velocity_14d_vs_60d (daily-rate ratio)
        │
        ▼
[4] synthesize-topic     LLM agent per topic with evidence + temporal hints →
                          • thesis (integrated 2-3 sentence read)
                          • temporal_state (early | current | late)
                          • layer_analysis (1-2 sentences per layer)
                          • corroboration_score (0..1)
                          • missing_evidence (concrete gaps)
                          • recommended_actions (2-4 monitoring tasks)
        │
        ▼
[5] save-unified-brief   • unified_signals rows
                         • unified_signal_evidence rows (top-5 packets/layer)
                         • output/unified-<ctx>-<asOf>.md
```

**Runtime on a populated context (4,005 packets, 8 topics):** ~55s end-to-end. The LLM steps dominate (~47s for synthesis); SQLite + matching steps are ~150ms total.

---

## 3. Quickstart

### Run a unified brief

```bash
# Make sure the context has fresh evidence across layers
pnpm flow run weekly-cadence --context claude-code-news-radar

# Generate the unified brief
pnpm flow run unify-signals --context claude-code-news-radar
```

### Read the brief

- **Triage view (top of the markdown):** `output/unified-<ctx>-<asOf>.md` — quick-scan triage table grouped by temporal state.
- **Detail per topic:** scroll the same file; each topic has its full per-layer analysis + missing evidence + actions.
- **DB-direct queries:** see [§4 Output shape](#4-output-shape) below.

### Customize the run

```bash
# Wider time window
pnpm flow run unify-signals --context <ctx> --sinceDate 2026-03-01

# Fewer / more topics
pnpm flow run unify-signals --context <ctx> --maxTopics 5
pnpm flow run unify-signals --context <ctx> --maxTopics 12

# Tighter evidence cap per layer (smaller LLM context)
pnpm flow run unify-signals --context <ctx> --perLayerCap 8
```

All inputs live in `flows/unify-signals.mjs`.

---

## 4. Output shape

### Markdown brief

`output/unified-<context>-<asOf>.md` — three sections:

1. **Header** with run metadata (context, asOf, topic count)
2. **Triage table** — every topic with `temporal_state · corroboration_score · layer_breadth · velocity_state` for quick scanning
3. **Per-topic detail** — thesis, temporal signature, what each layer says, missing evidence, recommended actions, key_terms

### `unified_signals` table

One row per (context, topic, run). Columns:

| Column | Purpose |
|---|---|
| `id` | `unified:<ctx>:<asOf>:<topic-slug>:<random>` — unique per run |
| `context_id` | FK to contexts |
| `topic` | Topic name (e.g. "Trust Crisis: Quota Change") |
| `description` | One-sentence framing |
| `thesis` | Integrated 2-3 sentence read across layers |
| `temporal_state` | `early` / `current` / `late` |
| `temporal_reasoning` | Why this state — references specific evidence |
| `key_terms` | JSON array — used for cross-layer matching |
| `first_detected` | Earliest packet date across all layers |
| `peak_at` | Highest weighted-volume day |
| `layer_coverage` | JSON `{layer: count}` |
| `layer_analysis` | JSON `{layer: prose}` |
| `corroboration_score` | 0..1 |
| `missing_evidence` | JSON array of strings |
| `recommended_actions` | JSON array of `{action, why}` |
| `model_used` | LLM model id |

### `unified_signal_evidence` table

M2M join — which actual `evidence_packets.id` rows back each topic, with `layer` + `relevance`. Capped at top-5 per layer per topic.

### Useful queries

```sql
-- All current topics in a context, by corroboration strength
SELECT topic, temporal_state, corroboration_score, layer_coverage
FROM unified_signals
WHERE context_id = 'claude-code-news-radar'
ORDER BY corroboration_score DESC;

-- The evidence backing one topic, grouped by layer
SELECT layer, ep.title, ep.url, ep.evidence_weight
FROM unified_signal_evidence use_
JOIN evidence_packets ep ON ep.id = use_.evidence_id
WHERE use_.unified_signal_id = '<id>'
ORDER BY layer, ep.evidence_weight DESC;

-- Topics that became "current" in the past week
SELECT topic, first_detected, peak_at, corroboration_score
FROM unified_signals
WHERE context_id = 'claude-code-news-radar'
  AND temporal_state = 'current'
  AND created_at >= date('now', '-7 days');
```

---

## 5. Producers — detail

All producers conform to:
```js
{ id, layer, kind: "search" | "snapshot", async search({ contextId, queries, ...opts }) }
```

| Producer | Layer | Kind | Auth | Discovery method | Notes |
|---|---|---|---|---|---|
| `reddit` | conversation | search | none | Direct Reddit search API + `subreddits` override | Adapter over `fetchReddit` + `normalizeRedditPosts` |
| `hackernews` | conversation | search | none | HN Algolia search | Posts + comments, dedupe inline |
| `polymarket` | expectation | snapshot | none | **Tag-based** via Gamma `/markets?tag_id=N` | Curated AI tag set: 439 AI, 553 anthropic, 537 OpenAI, 103303 Claude, 103648 Claude 5, 1401 Tech, 101999 Big Tech, 969 downtime, 1563 outage |
| `github` | behavior | search | optional (`GITHUB_TOKEN` for 30/min) | REST search repos + issues | Per query: repos + issues fetched separately |
| `google` | intent | search | none | **Playwright + Chrome** with persistent state at `data/browser-state` | Captures title + snippet + URL + position. Polite 2-4s jittered delay. CAPTCHA-resilient via human-in-loop |
| `anthropic` | truth | search | none (`GITHUB_TOKEN` raises rate limit) | GitHub Releases for `anthropics/claude-code` + SDK repos | Optional `--includeBlog` scrapes anthropic.com/news |
| `hn-hiring` | economic | search | none | Two-stage Algolia: find whoishiring threads via `search_by_date` → search comments within them | Each match = a hiring company committing budget |
| `yfinance` | capital | snapshot | none | Yahoo undocumented `query1.finance.yahoo.com/v8/finance/chart/<sym>` | Curated ticker basket (NVDA, AMD, AMZN, MSFT, GOOGL, META, AI, AAPL). Daily OHLC + volume |
| `stocktwits` | capital | search | none | Public `api.stocktwits.com/api/2/streams/symbol/<sym>.json` | Preserves bullish/bearish sentiment tags in `evidence_state` |
| `reddit-finance` | capital | search | none | Wrapper over `fetchReddit` scoped to r/wallstreetbets, r/stocks, r/investing, r/SecurityAnalysis | Relabels source_layer to `capital`; `source_id=reddit-finance` to avoid collision with conversation-layer Reddit |

### Polymarket discovery — important detail

The Gamma API's default `/markets` listing and `search` parameter both return generic top-volume markets (politics, sports, GTA VI) regardless of input. **Tag IDs (`tag_id=N`) are the only filter that actually narrows.** Tag IDs were discovered by inspecting the `tags` arrays on `/events` responses (markets themselves don't return tag arrays in the default response).

If a topic-specific tag doesn't exist, fall back to `--slugs` for hand-curated markets.

### Capital-market — why three sources

| Source | What it adds | Weakness |
|---|---|---|
| **yfinance** | Quantitative price + volume per day per ticker | No qualitative reasoning |
| **stocktwits** | Retail trader sentiment alongside the price move | Heavy bot noise |
| **reddit-finance** | Forum-level analysis from r/wallstreetbets etc | Speculation > institutional |

Together they triangulate. Anthropic is private — capital read is via beneficiaries / hosting partners / competitors.

---

## 6. The synthesis agent

`src/agents/multi-layer-synth.mjs` — uses Gemini 2.0 Flash via OpenRouter. Two modes:

### Mode 1 — `discoverTopics({ sampleByLayer, contextLabel, maxTopics })`

Input: top-weighted evidence per layer (default 12 packets/layer).
Output:
```ts
Array<{
  name: string,                              // "Trust Crisis: Quota Change"
  description: string,                       // one sentence
  key_terms: string[],                       // 4–8 distinctive terms for cross-layer matching
  temporal_hypothesis: "early" | "current" | "late",
  layers_present: string[],                  // subset of the 7 layers
}>
```

Prompt requires topics where MULTIPLE layers carry the same story; single-layer topics are skipped.

### Mode 2 — `synthesizeTopic({ topic, evidenceByLayer, contextLabel })`

Input: one topic + bucketed evidence from each layer.
Output:
```ts
{
  thesis: string,                            // 2–3 sentence integrated read
  temporal_state: "early" | "current" | "late",
  temporal_reasoning: string,                // why, with citations
  layer_analysis: {                          // 1–2 sentences each, "" if no evidence
    truth: string, conversation: string, intent: string,
    behavior: string, expectation: string, economic: string, capital: string,
  },
  corroboration_score: number,               // 0..1
  missing_evidence: string[],                // concrete gaps
  recommended_actions: Array<{ action, why }>,
}
```

**Anti-hallucination guardrails** (in the prompt):
- "NEVER invent specific numbers (dates, dollar amounts, version numbers, upvote counts) — only cite what's literally in the evidence"
- "If a layer has no evidence for this topic, set its layer_analysis to """
- "Be specific in layer_analysis — name the source by id (yfinance, polymarket, etc.) where useful"
- "Strict JSON only — no markdown, no commentary outside the JSON"

The synthesizer gets the **structural temporal hints** from step 3 inline in the prompt, so its `temporal_state` decision is grounded in real velocity numbers, not its own guesses.

---

## 7. Temporal classification

Three states, applied per topic:

| State | Marker | What to do |
|---|---|---|
| 🌱 **early** | Thin signal, often single-layer, new vocabulary, low velocity OR no prior history | Watch — set Google Alerts, monitor specific subs, no action yet |
| 🔥 **current** | Multi-layer, rising velocity, peak in last 14 days | Act — this is publishable / shippable / hedgeable right now |
| 🌒 **late** | Past peak, broad coverage, fading velocity, or materialization | Wind down — story has hit mainstream; look for next-order effects |

Structural inputs to the classification:
- `first_detected` — earliest packet across any layer
- `peak_at` — highest-weighted-volume day
- `peak_layer` — which of the 7 is loudest
- `layer_breadth` — how many of 7 layers carry the signal
- `velocity_14d_vs_60d` — daily-rate ratio (last 14 days vs prior 46 days)
- `velocity_state` — `rising` (≥1.5×) / `stable` (0.6–1.5×) / `fading` (≤0.6×)

The LLM gets these numbers; it doesn't have to recompute them.

---

## 8. First-run results (claude-code-news-radar, 2026-05-19)

8 topics extracted from 4,005 evidence packets across 7 layers in 55.4s. **One topic landed 7/7 layers** — the system's first cleanly cross-corroborated cross-layer signal.

| State | Topic | Corro | Layers | Velocity |
|---|---|---:|---:|---|
| 🔥 CURRENT | **Anthropic's Market Position Optimism** — Polymarket prices Anthropic at 74.1% for best AI model by June 2026 (vs Google 19%, OpenAI 3.3%); SDK ships aggressively; Google + Amazon investment threads on r/stocks | 0.85 | **7/7** | 14.69× rising |
| 🔥 CURRENT | **Claude Code Quality Degradation Concerns** — users report decline, comparisons to Codex, attributed to reasoning effort / system prompt changes | 0.80 | 6/7 | 6.51× rising |
| 🔥 CURRENT | **Token Usage and Cost Concerns** — `/goal` + `/superpowers` burning quotas faster than expected | 0.80 | 6/7 | 5.88× rising |
| 🔥 CURRENT | **Programmatic Claude Subscription Access Removal** — `claude -p` + Agent SDK quota change effective June 15 | 0.70 | 5/7 | 23.62× rising |
| 🔥 CURRENT | **Claude Code Configuration Persistence** — `/config` + `~/.claude/settings.json` shipped | 0.70 | 5/7 | 7.69× rising |
| 🔥 CURRENT | **Managed Agents Feature Expansion** — multi-agent, CMA Memory, in the SDKs | 0.70 | 4/7 | 2.64× rising |
| 🔥 CURRENT | **Python SDK Updates for Claude on AWS** — Bedrock integration releases | 1.00 | 1/7 | 6.77× rising |
| 🌱 EARLY | **AI Coding Agents in Software Development** — meta-trend, hiring signal appearing (Axis Communications hiring "agentic engineering") | 0.70 | 3/7 | 1.12× stable |

Full prose brief at `output/unified-claude-code-news-radar-2026-05-19.md`.

---

## 9. File index

### Schema (`src/db/migrate.mjs`)
- `unified_signals` table
- `unified_signal_evidence` table
- Indexes on `context_id`, `unified_signal_id`, `layer`

### Agent
- `src/agents/multi-layer-synth.mjs` — `discoverTopics` + `synthesizeTopic`

### Flow steps (`src/flows/steps/`)
- `discover-topics.mjs`
- `gather-cross-layer-evidence.mjs`
- `classify-temporal.mjs`
- `synthesize-topic.mjs`
- `save-unified-brief.mjs`

### Flow
- `flows/unify-signals.mjs`

### Producers (`src/pipeline/producers/`)
- `reddit.mjs`, `hackernews.mjs` — conversation
- `google.mjs` — intent
- `github.mjs` — behavior
- `polymarket.mjs` — expectation (refactored 2026-05-18 for tag-based discovery)
- `hn-hiring.mjs` — economic
- `yfinance.mjs`, `stocktwits.mjs`, `reddit-finance.mjs` — capital
- `anthropic.mjs` — truth
- `registry.mjs` — central producer map

### Navigation KG
All new files registered in the `:SignalsRepo` Neo4j navigation graph. Query examples:
```cypher
// Files implementing the unified flow
MATCH (f:SignalsRepo:file) WHERE f.path STARTS WITH "src/flows/steps/" RETURN f.name, f.role

// All producers and their layer
MATCH (f:SignalsRepo:file) WHERE f.path STARTS WITH "src/pipeline/producers/" RETURN f.name, f.layer ORDER BY f.layer
```

---

## 10. Open issues + future work

### Capital-market layer
- **Capital-market is the only layer with no Anthropic-direct source** (because they're private). Proxy via beneficiary tickers (NVDA, MSFT, AMZN, GOOGL). Cleanest future fix: a Crunchbase scrape for funding-round signal, but that's a paid API.

### Anti-noise on Stocktwits
- Stocktwits weight calibration penalizes obvious spam (high message count + zero followers), but the default 30-message fetch still drops 60-70% of messages through `keywordFilter`. Tune the regex per context.

### Polymarket coverage
- Polymarket's coverage of AI-coding-specific topics is thin. Even with tag-based discovery, you get markets at the "Anthropic IPO" or "Claude 5 release date" level, not "Will Anthropic ship MCP 2.0 by July?" level. Hand-curate slugs via `--slugs` when a specific narrative needs market evidence.

### Trivial-token problem in cross-layer linking
- The existing `incremental-linker` filters tokens appearing in ≥30% of signal title prefixes as "trivial" — which means "claude" and "code" can't drive cross-layer linking on a Claude Code context. The `unify-signals` flow sidesteps this by working topic-by-topic with explicit `key_terms`, not signal-title tokens.

### Dashboard surface
- The unified_signals table isn't yet wired into the dashboard. A new route `/unified/:context` would close the loop — current consumption is markdown file or direct SQL.

### Single-layer topics
- The discover-topics prompt requires multi-layer presence, but the LLM still occasionally returns single-layer topics (see "Python SDK Updates for Claude Platform on AWS" — 1.00 corroboration but only Primary truth layer). That's a prompt-tuning fix.

### Source-node table sync
- When a new producer is added, the dashboard's Source Nodes panel won't show it until a row is inserted into `source_nodes` for the relevant contexts. Currently this is manual. Long-term: auto-derive source_nodes from `listProducers()` × `contexts` at request time.

---

## 11. Why this architecture

The 7-layer design is not arbitrary. It reflects how reality actually leaks information:

- **Conversation** is the fastest layer — Reddit reactions within minutes.
- **Intent** is a lagging-by-hours layer — people search *after* they hear about something.
- **Behavior** is a lagging-by-days layer — building takes time.
- **Expectation** is the leading-by-weeks layer — prediction markets price the future probability *now*.
- **Economic** is a lagging-by-months layer — companies adjust hiring after the dust settles.
- **Capital** is real-time but noisy — prices move on signal AND on speculation.
- **Truth** is broadcast — the entity itself publishes when it wants to.

A topic that's just appearing in Conversation is **early**. A topic that's saturated Conversation + Intent + Behavior + Capital is **current**. A topic that's reached Economic (hiring) but is fading in Conversation is **late** — the bet has been placed; the news has matured.

That's what the temporal classifier is trying to read.

---

*Last updated 2026-05-19. Stable. Run `pnpm flow run unify-signals --context <ctx>` to produce a fresh brief.*
