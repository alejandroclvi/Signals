# Engineering Build Report: Roles, Stack, Patterns, Data Strategy, And Research Plan

Generated: 2026-04-18 21:31:58 EDT

Prepared for: Signals

Prepared by: Codex, OpenAI

Status: Strategic engineering report

## Executive Summary

Signals should be built as a data product platform, not as a conventional SaaS dashboard.

The system must connect messy external data producers, normalize their evidence, score the evidence, explain uncertainty, and show users which additional source nodes would improve confidence.

The best first engineering profile is a senior full-stack data systems engineer. That person should be able to build the first complete loop:

```text
source connector
-> normalized evidence packet
-> candidate signal
-> corroboration score
-> source enablement recommendation
-> dashboard
```

After the first vertical slice works, the team should split into specialized ownership areas:

1. Founding Full-Stack Data Systems Engineer
2. Backend Integrations Engineer
3. Data Platform Engineer
4. Search / Ranking / Applied ML Engineer
5. Frontend Data Visualization Engineer
6. Financial Data / Market Intelligence Engineer
7. Infrastructure / Security Engineer

The recommended starting stack is:

```text
Frontend:
Next.js, React, TypeScript

Backend/API:
FastAPI, Python, Pydantic

Database:
Postgres

Search:
Postgres full-text search and pgvector first
OpenSearch later if needed

Jobs:
Simple queue first
Temporal later for durable producer workflows

Data orchestration:
Dagster later for assets, backfills, schedules, and data quality

Analytics/time series:
Postgres first
ClickHouse later when event volume justifies it

Raw storage:
S3, Cloudflare R2, or Google Cloud Storage
```

The central design principle:

```text
Do not collect data just because it exists.
Every source must declare what evidence it adds, what confidence it improves, what it costs, what it cannot prove, and what is lost when disabled.
```

## Product Being Built

Signals detects early internet momentum around topics, markets, companies, behaviors, narratives, and opportunities.

It should answer:

```text
What is changing?
Where is the evidence?
Which source layers support it?
Which source layers are missing?
What can we trust?
What should we enable next to improve confidence?
```

The product has three planes:

1. Evidence Plane
   Collects, normalizes, stores, and preserves source evidence.

2. Intelligence Plane
   Extracts candidate signals, corroborates them, ranks them, and explains confidence.

3. Control Plane
   Lets the user enable, disable, inspect, and understand source nodes and capability gaps.

## Core System Model

The system should not treat platforms as interchangeable mention sources.

It should organize data by signal layer:

```text
Conversation
-> Intent
-> Expectation
-> Behavior
-> Economic Commitment
-> Capital Market Response
-> Primary Truth / Resolution
```

Examples:

```text
Conversation:
Reddit, Hacker News, X, LinkedIn, Discord, Slack, forums

Intent:
Google Search, Google Trends, YouTube Search, Q&A, reviews

Expectation:
Polymarket, prediction markets

Behavior:
GitHub, Stack Exchange, package registries, app stores, tutorials

Economic Commitment:
G2, jobs, procurement, funding, marketplaces, pricing pages

Capital Market Response:
stock prices, ETFs, indices, sector baskets, options data later

Primary Truth / Resolution:
SEC filings, official sources, fact checks, procurement awards, resolved markets
```

## Recommended Architecture

The core modules should be:

```text
01 Context Engine
02 Node Control Plane
03 Producer Mesh
04 Ingestion Scheduler
05 Evidence Fabric
06 Entity And Topic Graph
07 Financial Mapping Layer
08 Baseline Store
09 Corroboration Engine
10 Signal Scoring Engine
11 Source Enablement Recommender
12 Signal Story Builder
13 Dashboard And Analyst Workflow
14 Feedback And Outcome Learning
```

## Why This Is Not A Normal SaaS App

A normal SaaS dashboard mostly reads structured internal data.

Signals must ingest external, unreliable, rate-limited, policy-constrained, multi-format sources.

The hard parts are:

- source access
- source compliance
- rate limits
- source reliability
- duplicate evidence
- entity ambiguity
- noisy text
- time-window alignment
- source-layer interpretation
- confidence scoring
- visual explanation
- missing evidence
- what-to-enable-next recommendations

Therefore, the engineering team must build a system where every output is traceable to evidence.

## Stack Recommendation

### Frontend

Recommended:

```text
Next.js
React
TypeScript
React Flow or custom SVG
visx, D3, or ECharts
TanStack Query
Playwright for UI verification
```

Why:

- Good fit for interactive dashboards.
- Strong TypeScript ecosystem.
- Server and client rendering options.
- Good route/data composition.
- Works well for a product that needs source maps, dashboards, drilldowns, and analyst workflows.

### Backend/API

Recommended:

```text
Python
FastAPI
Pydantic
SQLAlchemy or SQLModel
Uvicorn
```

Why:

- Python is better for data/scoring/NLP workflows.
- FastAPI is pragmatic for typed APIs.
- Pydantic models align well with evidence packet schemas.
- The backend can host connector control APIs, signal APIs, scoring APIs, and dashboard APIs.

### Database

Recommended first:

```text
Postgres
```

Use Postgres for:

- source nodes
- producer queries
- evidence packets
- signal candidates
- signal aliases
- corroboration runs
- enablement recommendations
- source priors
- user context
- analyst feedback
- JSONB raw metadata
- full-text search
- pgvector semantic similarity

Why:

- One strong relational core keeps early architecture simple.
- Supports JSONB for flexible source payload metadata.
- Supports full-text search.
- Supports vector similarity through pgvector.
- Good enough until volume proves otherwise.

### Search

Recommended first:

```text
Postgres full-text search
pgvector
```

Recommended later:

```text
OpenSearch
```

Use OpenSearch only when:

- hybrid lexical/vector search becomes central
- text corpus grows large
- search latency matters
- relevance tuning becomes specialized

### Jobs And Workflows

Recommended first:

```text
Simple queue
Redis
Postgres job table
```

Recommended later:

```text
Temporal
```

Use Temporal when connector workflows need:

- durable retries
- long-running ingestion
- backoff
- resumability
- external API failure handling
- exactly-once-ish workflow discipline
- auditability

### Data Orchestration

Recommended later:

```text
Dagster
```

Use Dagster for:

- backfills
- baseline computation
- feature assets
- scheduled scoring runs
- data quality checks
- lineage
- reproducible derived tables

Do not start with Dagster until there are enough recurring derived datasets to justify it.

### Analytics And Event Store

Recommended first:

```text
Postgres
```

Recommended later:

```text
ClickHouse
```

Use ClickHouse when:

- evidence events are high-volume
- dashboards need fast time-series aggregations
- source metrics require large scans
- market data bars become large
- query cost in Postgres becomes too high

### Raw Storage

Recommended:

```text
S3
Cloudflare R2
Google Cloud Storage
```

Use object storage for:

- raw API payload snapshots
- large documents
- archived evidence
- source-specific payloads
- replayable ingestion snapshots

Store pointers in Postgres.

## Data Strategy

Use a bronze/silver/gold model.

### Bronze: Raw Source Layer

Purpose:

Preserve what came from the source.

Examples:

```text
raw_reddit_post_payload
raw_github_issue_payload
raw_polymarket_market_payload
raw_stock_bar_payload
raw_google_search_result_payload
```

Rules:

- preserve provenance
- respect source retention policies
- store raw pointer when full raw storage is not allowed
- record source API version
- record collection time
- record query used

### Silver: Normalized Evidence Layer

Purpose:

Convert producer payloads into comparable evidence packets.

Core object:

```text
evidence_packet
```

Fields:

```text
evidence_id
signal_id
producer_id
source_layer
native_id
native_url
canonical_url
observed_at
created_at_source
title
text_excerpt
metrics
entities
claims
urls
query_used
permission_scope
retention_policy
raw_payload_pointer
provenance
```

### Gold: Intelligence Layer

Purpose:

Produce user-facing intelligence.

Gold outputs:

```text
candidate_signals
corroboration_runs
signal_scores
source_independence_groups
baseline_features
enablement_recommendations
signal_story
dashboard_view_models
```

## Core Database Objects

Recommended early tables:

```text
source_nodes
producer_accounts
producer_queries
producer_checkpoints
raw_payloads
evidence_items
evidence_groups
signals
signal_aliases
signal_profiles
source_priors
baselines
corroboration_runs
corroboration_features
enablement_recommendations
human_labels
```

## Engineering Patterns

### Producer Adapter Pattern

Every source connector should expose the same internal contract:

```text
discover()
fetch()
normalize()
checkpoint()
estimate_cost()
declare_capabilities()
```

This keeps Reddit, GitHub, Polymarket, stock prices, Google Search, and future sources interchangeable at the system boundary.

### Idempotent Ingestion

Every source item should have a stable key:

```text
producer_id + native_id + source_version
```

The ingestion system should safely rerun without duplicating evidence.

### Cursor And Checkpoint Tables

Each producer should track:

```text
last_cursor
last_success_at
last_error_at
rate_limit_state
backoff_until
sync_window_start
sync_window_end
```

### Evidence Packet First

All scoring should happen on evidence packets, not raw source payloads.

This prevents source-specific logic from leaking everywhere.

### Versioned Scoring

Every score should record:

```text
engine_version
feature_version
source_prior_version
baseline_snapshot
query_plan_version
```

This is necessary because scoring logic and source availability will evolve.

### Explainable Heuristics Before ML

Start with transparent rules:

```text
source_independence
layer_progression
baseline_deviation
semantic_agreement
evidence_specificity
actor_quality
missing_expected_evidence
contradiction_penalty
```

Only add ML after there is analyst feedback and labeled outcomes.

### Capability Declarations

Every source node must declare:

```text
what_it_adds
what_it_cannot_prove
what_is_lost_if_disabled
what_it_costs
what_access_is_required
what_profiles_it_supports
what_gaps_it_fills
```

This powers the Source Enablement Recommender.

## Role-By-Role Build Plan

## 1. Founding Full-Stack Data Systems Engineer

### Mission

Build the first complete product loop.

This person should make the system real before the team over-specializes.

### Owns

```text
first connector
evidence packet schema
Postgres schema
basic scoring
first dashboard
first API
first source enablement recommender
deployment skeleton
```

### Builds First

```text
Reddit or Hacker News connector
normalized evidence packet
candidate signal extraction
basic signal score
signal detail API
node control panel
dashboard prototype
```

### Stack

```text
Next.js
React
TypeScript
FastAPI
Postgres
Pydantic
SQLAlchemy or SQLModel
Redis or simple Postgres job queue
S3/R2/GCS for raw payload pointers
```

### Patterns

- Vertical slice first.
- Monorepo is acceptable.
- Clear module boundaries.
- Evidence packet schema before source-specific dashboards.
- Simple scoring before ML.
- Keep connector logic isolated.

### Research First

Questions:

```text
Which first user context matters most?
Which first source proves value fastest?
Which first signal profile should the product optimize for?
What fields must every evidence item have?
What should the first dashboard decision be?
```

Deliverables:

```text
first schema
first working connector
first signal detail screen
first scoring explanation
first enablement recommendation
```

### Success Criteria

The first engineer succeeds when a user can see:

```text
Here is a candidate signal.
Here is the evidence.
Here is why it matters.
Here is what is missing.
Here is what to enable next.
```

## 2. Backend Integrations Engineer

### Mission

Build the Producer Mesh.

### Owns

```text
source connectors
auth flows
rate limits
retry/backoff
source compliance metadata
raw payload handling
normalization adapters
producer health
```

### Builds

```text
Reddit connector
Hacker News connector
GitHub connector
Stack Exchange connector
Google Search connector
Polymarket connector
financial market data connector
connector SDK
rate-limit manager
source health dashboard
```

### Stack

```text
Python
FastAPI internal APIs
Pydantic source models
Postgres
Redis
Temporal later
S3/R2/GCS
```

### Patterns

- Adapter pattern.
- Source-specific models at the edge.
- Normalized evidence models inside the system.
- Idempotent writes.
- Backoff and retry by source.
- Dead-letter queue for failed items.
- Explicit source capability declaration.

### Research First

For each source:

```text
official API access
authentication model
rate limits
quota cost
commercial-use restrictions
retention policy
deletion policy
historical backfill
real-time support
allowed storage
display rules
```

### Success Criteria

Connectors should be boring to operate.

They should answer:

```text
Are we collecting?
Are we rate-limited?
What did we last fetch?
What failed?
Can we replay?
What are we allowed to store?
```

## 3. Data Platform Engineer

### Mission

Make data reliable, replayable, auditable, and measurable.

### Owns

```text
raw storage strategy
data quality checks
baselines
backfills
feature tables
lineage
partitioning
pipeline observability
retention jobs
```

### Builds

```text
bronze raw layer
silver evidence layer
gold feature layer
baseline computation
backfill framework
data quality checks
source freshness monitors
feature versioning
```

### Stack

```text
Postgres
S3/R2/GCS
Dagster later
dbt later if transformation count grows
ClickHouse later for high-volume events/time series
Great Expectations or custom validation checks
```

### Patterns

- Bronze/silver/gold.
- Immutable raw snapshots when allowed.
- Derived tables are rebuildable.
- Features are versioned.
- Pipelines have freshness SLAs.
- Data quality failures are visible.
- Every derived output can trace back to evidence.

### Research First

Questions:

```text
How much source data will we ingest daily?
Which data must be retained?
Which data cannot be retained?
Which outputs must be replayable?
Which baselines are needed for V0?
How fresh does each source need to be?
What customer data boundaries are required?
```

### Success Criteria

The team can rerun a scoring job and explain why the score changed.

## 4. Search / Ranking / Applied ML Engineer

### Mission

Turn evidence into ranked, explainable intelligence.

### Owns

```text
candidate extraction
entity resolution
topic clustering
semantic similarity
source independence
corroboration scoring
ranking
evaluation
outcome learning
```

### Builds

```text
candidate signal extractor
topic/entity matching
semantic deduplication
evidence grouping
source independence score
corroboration score
enablement score features
ranking evaluation set
analyst feedback loop
```

### Stack

```text
Python
Postgres full-text search
pgvector
OpenSearch later
embedding models
scikit-learn later
notebooks for offline evaluation
```

### Patterns

- Heuristics first.
- Explanation for every score.
- Missing evidence is a feature.
- Source independence is not raw count.
- Penalize duplicate amplification.
- Separate confidence from popularity.
- Evaluate by analyst acceptance, not only model metrics.

### Research First

Questions:

```text
What makes a signal useful?
What makes a false positive?
Which sources are independent?
Which sources are lagging indicators?
Which signal profiles need which validation layers?
What labels can analysts provide consistently?
What outcome data is available?
```

### Success Criteria

The system can explain:

```text
Why this signal is ranked above another.
Why confidence increased.
Why confidence is capped.
What evidence is missing.
What source should be enabled next.
```

## 5. Frontend Data Visualization Engineer

### Mission

Make the intelligence usable.

### Owns

```text
dashboard
source node map
enable/disable controls
node inspector
evidence ladder
timeline
confidence breakdown
what-to-enable-next panel
signal detail pages
analyst workflow
```

### Builds

```text
system map
source control panel
current capability view
signal detail page
evidence map
source independence matrix
corroboration ladder
missing evidence panel
enablement recommender panel
```

### Stack

```text
Next.js
React
TypeScript
React Flow or custom SVG
visx, D3, or ECharts
TanStack Query
Playwright
```

### Patterns

- Dashboard as decision surface.
- Show evidence before score.
- Show uncertainty.
- Show missing evidence.
- Show disabled-node consequences.
- Progressive disclosure.
- Stable layouts for dense information.
- Visual states for enabled, disabled, gated, degraded, and unavailable nodes.

### Research First

Questions:

```text
What decision is the user making?
What do they need to trust the system?
What evidence should be first-screen visible?
What belongs in drilldown?
How should uncertainty be shown?
How should source gaps be shown?
How should enablement recommendations be explained?
```

### Success Criteria

The user can answer:

```text
What is happening?
Why should I believe it?
What is missing?
What do I enable next?
What does enabling it add?
```

## 6. Financial Data / Market Intelligence Engineer

### Mission

Make stock prices useful as capital-market response evidence.

### Owns

```text
ticker mapping
company mapping
sector baskets
benchmark mapping
stock-price ingestion
adjusted prices
abnormal returns
relative volume
volatility features
market reaction labels
```

### Builds

```text
topic -> company mapping
company -> ticker mapping
theme baskets
benchmark selection
daily OHLCV ingestion
delayed intraday bars
abnormal return features
sector-relative movement
volume spike detection
market confirms/ignores/contradicts labels
```

### Stack

```text
Python
Postgres
pandas or polars for research
market data provider APIs
ClickHouse later for high-volume bars
```

### Patterns

- Topic to company to ticker to basket.
- Benchmark-relative returns.
- Event windows.
- Corporate-action adjustment.
- Market session awareness.
- Delayed versus real-time separation.
- Never imply causality without evidence.

### Research First

Questions:

```text
Which market data provider is legally usable?
Do we need delayed, end-of-day, or real-time data?
Can derived features be displayed?
How do we handle splits and dividends?
Which benchmarks fit each signal?
What baskets matter to the target user?
How do we avoid causal overclaiming?
```

### Success Criteria

The system can say:

```text
Related public-market assets are repricing.
The move is abnormal versus benchmark.
The move is broad across the basket.
Volume is above baseline.
This supports or contradicts the internet signal.
```

## 7. Infrastructure / Security Engineer

### Mission

Make the platform reliable, secure, observable, and ready for customers.

### Owns

```text
deployment
secrets
tenant isolation
observability
audit logs
access controls
data retention
cost monitoring
compliance infrastructure
```

### Builds

```text
Dockerized services
environment management
secrets management
CI/CD
observability stack
error reporting
audit logging
rate-limit budget monitors
tenant isolation
data deletion workflows
```

### Stack

```text
Docker
AWS, GCP, Render, Fly, or similar
Terraform later
OpenTelemetry
Sentry
Prometheus/Grafana later
cloud secrets manager
```

### Patterns

- Least privilege.
- Per-tenant data boundaries.
- Encrypted secrets.
- Audit trails.
- Source-specific retention.
- Cost budgets per connector.
- No broad scraping without explicit authorization.

### Research First

Questions:

```text
What data is sensitive?
What customer data is private?
What source policies constrain storage?
What needs auditability?
When will SOC2 matter?
How should tenant isolation work?
What deletion rights must be supported?
```

### Success Criteria

The system can be trusted by paying customers and source platforms.

## Recommended Team Sequencing

### Phase 0: One Senior Full-Stack Data Systems Engineer

Goal:

Build the first useful vertical slice.

Team:

```text
1 founding full-stack data systems engineer
```

Deliverable:

```text
Reddit or HN -> evidence packets -> candidate signal -> dashboard -> enablement recommendation
```

### Phase 1: Add Backend Integrations

Goal:

Expand the Producer Mesh.

Team:

```text
founding engineer
backend integrations engineer
```

Deliverable:

```text
Reddit
Hacker News
GitHub
Stack Exchange
Google Search
```

### Phase 2: Add Ranking And Data Platform

Goal:

Improve quality and replayability.

Team:

```text
founding engineer
backend integrations engineer
data platform engineer
search/ranking engineer
```

Deliverable:

```text
baselines
corroboration runs
source independence
evaluation set
backfills
feature tables
```

### Phase 3: Add Product-Grade Dashboard

Goal:

Make intelligence usable.

Team:

```text
frontend data visualization engineer
```

Deliverable:

```text
system map
source control plane
node inspector
what-to-enable-next panel
signal detail view
evidence timeline
```

### Phase 4: Add Financial Market Intelligence

Goal:

Add public-market validation.

Team:

```text
financial data / market intelligence engineer
```

Deliverable:

```text
stock prices
ETF baskets
benchmarks
abnormal return
relative volume
market confirms/ignores/contradicts labels
```

### Phase 5: Add Infrastructure And Security Depth

Goal:

Prepare for customers and scale.

Team:

```text
infrastructure/security engineer
```

Deliverable:

```text
production deployment
observability
secrets
tenant isolation
audit logs
retention controls
cost monitoring
```

## First 90-Day Plan

### Days 1-15: Foundation

Build:

- repo structure
- Postgres schema
- source node model
- evidence packet model
- first connector skeleton
- first dashboard shell

Research:

- first target user
- first signal profile
- first 2 data sources
- source policies
- evidence packet minimum schema

### Days 16-30: First Signal Loop

Build:

- Reddit or HN ingestion
- normalized evidence packets
- candidate signal extraction
- simple scoring
- first signal detail page

Research:

- false positive examples
- useful signal examples
- baseline needs
- analyst review flow

### Days 31-45: Corroboration V0

Build:

- second source connector
- source independence grouping
- missing evidence detection
- corroboration run table
- confidence explanation

Research:

- scoring features
- source priors
- expected validation profiles

### Days 46-60: Enablement Recommender V0

Build:

- source capability declarations
- enablement recommendation object
- what-to-enable-next panel
- disabled node consequence model

Research:

- marginal value scoring
- cost/access/compliance penalties
- user context weighting

### Days 61-75: More Producers

Build:

- GitHub
- Stack Exchange
- Google Search
- connector health
- checkpointing

Research:

- rate limits
- cost per useful signal
- source-specific retention rules

### Days 76-90: Product Hardening

Build:

- dashboard improvements
- error states
- analyst labels
- baseline snapshots
- first evaluation set

Research:

- user feedback
- accepted versus rejected signal patterns
- which source to add next

## Major Technical Risks

### 1. Source Access Risk

Some sources are gated, paid, or policy-constrained.

Mitigation:

- do not depend on any one source
- maintain source availability states
- show gated nodes clearly
- design fallback providers

### 2. False Corroboration Risk

The system may confuse duplicate amplification for independent evidence.

Mitigation:

- evidence grouping
- canonical URL matching
- semantic deduplication
- actor/source clustering
- independence scoring

### 3. Entity Ambiguity Risk

Terms can map to multiple concepts.

Mitigation:

- alias tables
- negative filters
- entity graph
- analyst correction
- semantic agreement thresholds

### 4. Scoring Trust Risk

Users may not trust a score if they cannot inspect it.

Mitigation:

- no score without explanation
- show feature contributions
- show missing evidence
- show source provenance

### 5. Financial Causality Risk

Stock prices may move for unrelated reasons.

Mitigation:

- use benchmark-relative returns
- use baskets
- flag macro/earnings confounds
- phrase output as market response, not causality

### 6. Data Cost Risk

Search, social, market, and review data can become expensive.

Mitigation:

- query budgets
- source routing
- caching
- source enablement score includes cost penalty
- collect only what improves confidence

## Research Agenda Before Scaling

### Product Research

Questions:

```text
Who is the first user?
What decisions are they making?
What signals would they pay for?
How early does the signal need to be?
What evidence makes them trust it?
What source gaps matter most?
```

### Source Research

Questions:

```text
Which sources are accessible?
Which sources are legal to store?
Which sources are low-friction?
Which sources are expensive?
Which sources are unique?
Which sources are redundant?
```

### Data Research

Questions:

```text
What is the minimum evidence packet?
What raw payloads can be retained?
What baselines matter?
What needs backfill?
What needs real-time?
What can be delayed?
```

### Scoring Research

Questions:

```text
What makes a true signal?
What makes a false signal?
What evidence should increase confidence?
What evidence should cap confidence?
What contradiction sources matter?
How should missing evidence be scored?
```

### UX Research

Questions:

```text
What should be first-screen visible?
What should be drilldown?
How should uncertainty be shown?
How should source gaps be shown?
How should recommendations be explained?
```

## Suggested Hiring Spec

### First Hire

Title:

```text
Founding Full-Stack Data Systems Engineer
```

Profile:

```text
70% backend/data systems
20% product/frontend/dashboard
10% applied search/ranking/ML
```

Must have:

- Python or TypeScript backend skill
- Postgres
- API integrations
- background jobs
- data modeling
- dashboard/product sense
- comfort with messy external data
- pragmatic scoring and ranking instincts

Nice to have:

- search systems
- embeddings
- data visualization
- financial data
- source compliance experience

Interview project:

```text
Build a mini Signals pipeline:
- ingest Hacker News or Reddit
- normalize evidence packets
- extract candidate topics
- score momentum
- show evidence and missing validation
- recommend one source to enable next
```

Evaluation:

```text
Does the candidate design clean data contracts?
Do they handle retries and rate limits?
Do they avoid overbuilding?
Can they explain uncertainty?
Can they build a usable UI?
Can they reason about source quality?
```

## Recommended First Implementation Scope

Do not start with all sources.

Start with:

```text
Reddit or Hacker News
GitHub
Google Search
source node map
evidence packet schema
corroboration V0
source enablement recommender V0
```

Then add:

```text
Stack Exchange
Polymarket
financial market data
Google Trends, if access is granted
G2/jobs/procurement later
```

## Final Recommendation

The correct engineering approach is:

```text
Build the evidence system first.
Build the dashboard around evidence and uncertainty.
Build scoring with transparent heuristics.
Build source enablement as a control-plane feature.
Add ML only after the system has labels and failure analysis.
```

The team should not optimize for volume of data collected. It should optimize for useful confidence.

The best version of Signals is not:

```text
A dashboard with many feeds.
```

It is:

```text
An intelligence system that understands what evidence exists, what evidence is missing, and what source would most improve the user's ability to trust the signal.
```

## Sources Checked

- Next.js documentation: https://nextjs.org/docs/app/getting-started/fetching-data
- FastAPI documentation: https://fastapi.tiangolo.com/
- FastAPI Background Tasks: https://fastapi.tiangolo.com/tutorial/background-tasks/
- PostgreSQL JSON documentation: https://www.postgresql.org/docs/current/datatype-json.html
- PostgreSQL full-text search documentation: https://www.postgresql.org/docs/current/textsearch.html
- pgvector documentation: https://github.com/pgvector/pgvector
- Dagster assets documentation: https://docs.dagster.io/guides/build/assets
- Temporal workflow documentation: https://docs.temporal.io/workflows
- ClickHouse MergeTree documentation: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree
- OpenSearch hybrid search documentation: https://docs.opensearch.org/latest/vector-search/ai-search/hybrid-search/index/
- Apache Kafka documentation: https://kafka.apache.org/documentation/

## Signature

Signed:

```text
Codex, OpenAI
Engineering research and architecture assistant
```

Timestamp:

```text
2026-04-18 21:31:58 EDT
```

