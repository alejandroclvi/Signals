# Linear Project Plan: Signal MVP

Generated: 2026-04-18

Prepared for: Signals

Prepared by: Codex, OpenAI

Linear status: ready to create after Codex restart loads the Linear MCP tools.

## Project

Project name:

```text
Signal MVP
```

Project summary:

```text
Build the first end-to-end Signals MVP: source ingestion, normalized evidence packets, corroboration V0, source enablement recommendations, and an interactive dashboard that shows what evidence exists, what is missing, and what source should be enabled next.
```

Recommended project description:

```text
Signal MVP is the first product slice of the Signals platform. It proves the core intelligence loop: collect evidence from a small set of producers, normalize it into evidence packets, extract candidate signals, run transparent corroboration scoring, recommend what source to enable next, and display the result in a usable dashboard.

The MVP should not optimize for many data sources. It should optimize for trustworthy evidence, source-layer interpretation, explainable scoring, and a clear control plane for enabled, disabled, gated, and degraded nodes.
```

Target outcome:

```text
A user can inspect a signal, see supporting evidence, understand missing validation, and know what source node to enable next to improve confidence.
```

Recommended project labels:

```text
mvp
architecture
backend
frontend
data-platform
integrations
ranking
dashboard
linear-ready
```

Recommended milestones:

1. Foundation
2. Producer Mesh V0
3. Evidence And Corroboration V0
4. Source Enablement Recommender V0
5. Dashboard MVP
6. MVP Hardening

## Builder Standup

### Founding Full-Stack Data Systems Engineer

Yesterday / context:

- Architecture docs now define Evidence Plane, Intelligence Plane, and Control Plane.
- Dashboard prototype exists as a static proof of concept.
- Source Enablement Recommender is now a first-class module.

Today / focus:

- Create the first working product loop.
- Define the repo structure, API shape, database schema, and MVP dashboard shell.
- Keep the implementation narrow enough to ship quickly.

Blockers:

- Need final decision on first two producers.
- Need Linear project and tickets created after MCP restart.

### Backend Integrations Engineer

Yesterday / context:

- Producer research exists for Reddit, HN, GitHub, Stack Exchange, Google Search/Trends, Polymarket, and financial market data.

Today / focus:

- Define a connector contract.
- Build the first source connector.
- Implement checkpoints, idempotency, and rate-limit metadata.

Blockers:

- Need source access credentials and target source order.
- Need policy review for each producer before storing raw payloads.

### Data Platform Engineer

Yesterday / context:

- Evidence packets, raw payload pointers, baselines, and scoring runs are defined conceptually.

Today / focus:

- Convert those concepts into concrete Postgres tables.
- Define bronze/silver/gold data strategy.
- Make derived data replayable.

Blockers:

- Need retention rules per source.
- Need target freshness for MVP.

### Search / Ranking / Applied ML Engineer

Yesterday / context:

- Corroboration Engine and Source Enablement Recommender docs define transparent V0 scoring.

Today / focus:

- Define candidate extraction and scoring heuristics.
- Build source-layer and missing-evidence scoring.
- Avoid black-box ML until labels exist.

Blockers:

- Need first evaluation set of accepted/rejected signals.
- Need initial source priors.

### Frontend Data Visualization Engineer

Yesterday / context:

- Static dashboard prototype exists with system map, source toggles, evidence ladder, and enablement recommendations.

Today / focus:

- Convert prototype into app components.
- Define dashboard API contracts.
- Preserve visual states for enabled, disabled, gated, and degraded nodes.

Blockers:

- Need real API response shapes.
- Need first dashboard user story finalized.

### Financial Data / Market Intelligence Engineer

Yesterday / context:

- Financial market data is now defined as the Capital Market Response layer.

Today / focus:

- Define ticker/basket/benchmark mapping requirements.
- Decide delayed versus end-of-day data for MVP.
- Keep stock-price output framed as market response, not causality.

Blockers:

- Need market data provider decision.
- Need list of first monitored themes/tickers.

### Infrastructure / Security Engineer

Yesterday / context:

- System will ingest external APIs with source-specific policies and possible customer-private data later.

Today / focus:

- Define deployment baseline, secrets handling, audit logs, and source credentials model.

Blockers:

- Need deployment target decision.
- Need tenant model decision before customer opt-in sources.

## MVP Tickets

### Foundation

#### 1. Define MVP scope and first signal profile

Role: Founding Full-Stack Data Systems Engineer

Priority: High

Labels: `mvp`, `product`, `architecture`

Description:

Define the first MVP user context, first signal profile, and first source set. This prevents the product from becoming a generic data collector.

Acceptance criteria:

- First user context is documented.
- First signal profile is selected.
- First 2-3 producers are selected.
- Out-of-scope sources are explicitly listed.
- MVP success criteria are written.

#### 2. Create initial repository and service structure

Role: Founding Full-Stack Data Systems Engineer

Priority: High

Labels: `mvp`, `backend`, `frontend`, `architecture`

Description:

Create the initial application structure for API, jobs, database migrations, and dashboard.

Acceptance criteria:

- Project has backend, frontend, and shared schema areas.
- Local development instructions exist.
- Environment variable pattern is documented.
- Placeholder API health endpoint exists.
- Placeholder dashboard route exists.

#### 3. Define source node capability schema

Role: Data Platform Engineer

Priority: High

Labels: `data-platform`, `architecture`, `source-enablement`

Description:

Create the schema for source nodes so the system can know what each producer adds, requires, costs, and unlocks.

Acceptance criteria:

- `source_nodes` schema is defined.
- Node statuses include enabled, disabled, available, gated, degraded, and requires_configuration.
- Each node can store features unlocked and features lost if disabled.
- Each node can store source layer, access state, cost model, compliance risk, and supported signal profiles.

#### 4. Define normalized evidence packet schema

Role: Data Platform Engineer

Priority: High

Labels: `data-platform`, `evidence`, `backend`

Description:

Create the canonical evidence item schema that every connector must output.

Acceptance criteria:

- Evidence schema includes producer ID, source layer, native ID, native URL, observed time, source-created time, title/text, metrics, entities, query used, permission scope, retention policy, and raw payload pointer.
- Schema supports JSON metadata for source-specific fields.
- Idempotency key is defined.
- Migration or schema document exists.

#### 5. Define signal and corroboration run schemas

Role: Data Platform Engineer

Priority: High

Labels: `data-platform`, `corroboration`, `backend`

Description:

Create database schemas for candidate signals, signal aliases, corroboration runs, and score features.

Acceptance criteria:

- `signals` schema is defined.
- `signal_aliases` schema is defined.
- `corroboration_runs` schema is defined.
- `corroboration_features` schema is defined.
- Score versioning fields are included.

### Producer Mesh V0

#### 6. Implement producer connector interface

Role: Backend Integrations Engineer

Priority: High

Labels: `integrations`, `backend`, `architecture`

Description:

Create a standard connector interface for all source producers.

Acceptance criteria:

- Interface includes discover, fetch, normalize, checkpoint, estimate cost, and declare capabilities.
- Connector outputs normalized evidence packets.
- Connector records rate-limit and checkpoint state.
- Connector errors are captured in a standard format.

#### 7. Implement Hacker News connector V0

Role: Backend Integrations Engineer

Priority: High

Labels: `integrations`, `hacker-news`, `backend`

Description:

Build an HN connector using the official Firebase API and local indexing/search strategy.

Acceptance criteria:

- Fetches recent stories and comments.
- Normalizes items to evidence packets.
- Stores source provenance.
- Checkpointing prevents duplicate ingestion.
- Basic source health metrics are recorded.

#### 8. Implement Reddit connector V0

Role: Backend Integrations Engineer

Priority: High

Labels: `integrations`, `reddit`, `backend`

Description:

Build a Reddit connector for selected subreddits or query-driven ingestion.

Acceptance criteria:

- Auth model is documented.
- Rate-limit headers are captured.
- Posts and comments normalize into evidence packets.
- Retention/deletion considerations are documented.
- Connector supports a limited configured subreddit/query set.

#### 9. Implement GitHub connector V0

Role: Backend Integrations Engineer

Priority: Medium

Labels: `integrations`, `github`, `behavior`

Description:

Build a targeted GitHub connector for repos, issues, discussions, and search around watched topics.

Acceptance criteria:

- Authenticated API access works.
- Search queries are targeted and rate-limit aware.
- Repos/issues normalize into evidence packets.
- Stars are not treated as adoption by themselves.
- Implementation-behavior features are extracted.

#### 10. Implement Google Search connector V0

Role: Backend Integrations Engineer

Priority: Medium

Labels: `integrations`, `google-search`, `intent`

Description:

Build a Google Custom Search connector for web discovery, docs, tutorials, comparisons, and official-source lookup.

Acceptance criteria:

- Query budget is configurable.
- Results normalize into evidence packets.
- Query string and result rank are stored.
- Connector declares cost and quota model.
- Search evidence is labeled as intent/discovery, not demand volume.

### Evidence And Corroboration V0

#### 11. Build candidate signal extractor V0

Role: Search / Ranking / Applied ML Engineer

Priority: High

Labels: `ranking`, `signals`, `backend`

Description:

Extract candidate signals from normalized evidence using simple heuristics.

Acceptance criteria:

- Candidate extractor can group evidence by topic/entity/phrase.
- Extractor stores signal candidates.
- Extractor records origin evidence.
- Rules are transparent and configurable.
- False positive examples can be inspected.

#### 12. Build source independence grouping V0

Role: Search / Ranking / Applied ML Engineer

Priority: High

Labels: `ranking`, `corroboration`, `evidence`

Description:

Group duplicate or dependent evidence so repeated mentions do not count as independent validation.

Acceptance criteria:

- Exact URL duplicates are grouped.
- Same-thread items are grouped.
- Same-author and same-domain grouping rules exist.
- Evidence groups store independence weight.
- Dashboard API can show evidence groups.

#### 13. Build Corroboration Engine V0

Role: Search / Ranking / Applied ML Engineer

Priority: High

Labels: `corroboration`, `ranking`, `mvp`

Description:

Implement transparent scoring across source layers.

Acceptance criteria:

- Score includes source independence, layer progression, baseline deviation placeholder, semantic agreement placeholder, missing evidence, and contradiction placeholder.
- Score outputs confidence band.
- Score outputs stage.
- Score exposes feature contributions.
- Score avoids black-box logic.

#### 14. Build missing evidence detector

Role: Search / Ranking / Applied ML Engineer

Priority: High

Labels: `corroboration`, `source-enablement`, `ranking`

Description:

Detect expected validation layers and features that are absent for a given signal profile.

Acceptance criteria:

- Signal profile defines expected layers.
- Missing layers are computed.
- Missing source features are computed.
- Confidence ceiling reasons are generated.
- Output feeds the Source Enablement Recommender.

### Source Enablement Recommender V0

#### 15. Implement Source Enablement Recommender V0

Role: Founding Full-Stack Data Systems Engineer

Priority: High

Labels: `source-enablement`, `corroboration`, `mvp`

Description:

Build the recommender that decides what source node should be enabled next based on marginal intelligence value.

Acceptance criteria:

- Recommender scores disabled, gated, available, and degraded nodes.
- Scoring considers profile fit, missing evidence value, expected lift, uniqueness, freshness, access friction, cost, redundancy, and quality risk.
- Recommendation types include enable_now, configure_first, request_access, keep_disabled, not_relevant, and wait_for_signal.
- Recommendations include reason, gap filled, expected lift, requirements, and risks.

#### 16. Add enablement recommendation storage

Role: Data Platform Engineer

Priority: Medium

Labels: `data-platform`, `source-enablement`

Description:

Persist recommendations from the Source Enablement Recommender.

Acceptance criteria:

- `enablement_recommendations` schema exists.
- Recommendation stores node ID, rank, score, expected lift, gaps filled, reason, requirements, and risks.
- Recommendations are linked to signal and corroboration run.
- Historical recommendations can be inspected.

#### 17. Define source capability declarations for MVP nodes

Role: Backend Integrations Engineer

Priority: High

Labels: `integrations`, `source-enablement`

Description:

Define capability metadata for each MVP producer node.

Acceptance criteria:

- Reddit source node declaration exists.
- HN source node declaration exists.
- GitHub source node declaration exists.
- Google Search source node declaration exists.
- Polymarket and financial market data placeholders exist.
- Each declaration lists what it adds, what it cannot prove, requirements, cost/access risk, and gaps filled.

### Dashboard MVP

#### 18. Convert dashboard prototype into app components

Role: Frontend Data Visualization Engineer

Priority: High

Labels: `frontend`, `dashboard`, `mvp`

Description:

Convert the static HTML dashboard prototype into reusable app components.

Acceptance criteria:

- Source node map component exists.
- Node control panel component exists.
- Node inspector component exists.
- Current capability component exists.
- What To Enable Next component exists.
- Signal simulation/data is provided through mock API or fixtures.

#### 19. Build signal detail page V0

Role: Frontend Data Visualization Engineer

Priority: High

Labels: `frontend`, `signals`, `dashboard`

Description:

Create a signal detail page that explains evidence, confidence, missing validation, and recommended next sources.

Acceptance criteria:

- Page shows signal title and summary.
- Page shows confidence band and score breakdown.
- Page shows evidence ladder.
- Page shows source independence groups.
- Page shows missing validation panel.
- Page shows What To Enable Next recommendations.

#### 20. Build dashboard API for source map and recommendations

Role: Founding Full-Stack Data Systems Engineer

Priority: High

Labels: `backend`, `frontend`, `dashboard`, `source-enablement`

Description:

Create API endpoints that power the dashboard source map and recommendation panel.

Acceptance criteria:

- API returns source nodes and statuses.
- API returns enabled/disabled/gated/degraded states.
- API returns capability gaps.
- API returns recommendations with score, expected lift, reason, and requirements.
- API returns signal summary and evidence ladder.

#### 21. Add analyst feedback controls

Role: Frontend Data Visualization Engineer

Priority: Medium

Labels: `frontend`, `feedback`, `ranking`

Description:

Add basic controls for analysts to accept, reject, or flag a signal.

Acceptance criteria:

- Analyst can mark signal as real signal, false positive, too early, duplicate, or wrong topic.
- Feedback is persisted.
- Feedback appears in the signal detail page.
- Feedback is linked to scoring/evaluation records.

### Financial Market Data

#### 22. Define financial mapping model

Role: Financial Data / Market Intelligence Engineer

Priority: Medium

Labels: `financial-data`, `capital-market-response`, `data-platform`

Description:

Define how topics map to companies, tickers, sectors, ETFs, baskets, competitors, and benchmarks.

Acceptance criteria:

- Topic-to-company mapping model is documented.
- Company-to-ticker mapping model is documented.
- Basket and benchmark schema is defined.
- Manual curated baskets are supported for MVP.
- Ambiguous mappings can be flagged.

#### 23. Implement stock price ingestion V0

Role: Financial Data / Market Intelligence Engineer

Priority: Medium

Labels: `financial-data`, `integrations`, `capital-market-response`

Description:

Implement delayed or end-of-day OHLCV ingestion for watched tickers and ETFs.

Acceptance criteria:

- Provider decision is documented.
- Daily OHLCV ingestion works for configured tickers.
- Adjusted price handling is defined.
- Data is linked to ticker and basket records.
- Connector declares licensing and freshness limits.

#### 24. Compute capital-market response features V0

Role: Financial Data / Market Intelligence Engineer

Priority: Medium

Labels: `financial-data`, `ranking`, `capital-market-response`

Description:

Compute market response features for public-company and sector signals.

Acceptance criteria:

- Return 1d, 5d, and 20d are computed.
- Abnormal return versus benchmark is computed.
- Relative volume is computed.
- Basket breadth is computed.
- Market response label is generated: confirms, ignores, contradicts, unclear, or not mapped.

### MVP Hardening

#### 25. Add pipeline health and source freshness monitoring

Role: Data Platform Engineer

Priority: Medium

Labels: `data-platform`, `observability`, `integrations`

Description:

Track source freshness, connector failures, and pipeline health.

Acceptance criteria:

- Source health table or view exists.
- Dashboard can show degraded nodes.
- Failed connector runs are visible.
- Last successful sync is visible per source.
- Backoff state is visible per source.

#### 26. Add source compliance metadata and retention handling

Role: Infrastructure / Security Engineer

Priority: High

Labels: `security`, `compliance`, `integrations`

Description:

Define and implement source-specific retention and compliance metadata.

Acceptance criteria:

- Each evidence item stores permission scope and retention policy.
- Each source node stores compliance notes.
- Deletion/update requirements are documented.
- Raw payload storage rules are source-aware.
- Sensitive credentials are not stored in plaintext.

#### 27. Create first evaluation set

Role: Search / Ranking / Applied ML Engineer

Priority: Medium

Labels: `ranking`, `evaluation`, `feedback`

Description:

Create an initial manually reviewed set of signals for evaluating ranking and corroboration.

Acceptance criteria:

- At least 25 candidate signals are reviewed.
- Each signal has accepted/rejected/too early/duplicate labels.
- Reasons are captured.
- False positive patterns are summarized.
- Feature adjustments are proposed.

#### 28. Prepare MVP demo script

Role: Founding Full-Stack Data Systems Engineer

Priority: Medium

Labels: `mvp`, `demo`, `product`

Description:

Prepare a demo flow that shows the end-to-end value of Signals.

Acceptance criteria:

- Demo uses one realistic signal.
- Demo shows source evidence.
- Demo shows missing validation.
- Demo shows what to enable next.
- Demo shows how confidence changes after enabling a node.
- Demo can be run locally.

## Suggested Linear Creation Order

1. Create project `Signal MVP`.
2. Create labels if missing:
   - `mvp`
   - `architecture`
   - `backend`
   - `frontend`
   - `data-platform`
   - `integrations`
   - `ranking`
   - `dashboard`
   - `source-enablement`
   - `financial-data`
   - `security`
3. Create issues in milestone order.
4. Assign owners once team members exist in Linear.
5. Use priority High for tickets 1-8, 11-15, 18-20, and 26.
6. Use priority Medium for later producer and hardening tickets.

## After Linear MCP Is Available

Commands to run through Codex after restart:

```text
List my Linear teams.
Create a Linear project named "Signal MVP" using the project summary from linear/SIGNAL_MVP_LINEAR_PROJECT_PLAN.md.
Create the labels listed in the plan if they do not already exist.
Create the MVP tickets from the plan in milestone order.
```

