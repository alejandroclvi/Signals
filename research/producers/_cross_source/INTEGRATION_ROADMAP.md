# Integration Roadmap

Last checked: 2026-04-18

## Phase 1: MVP Producers

Goal: prove that Signals can identify real momentum using accessible official APIs.

Producers:

- Reddit
- Hacker News
- GitHub
- Stack Exchange
- Product Hunt

Why:

- These sources expose strong public or semi-public signal data.
- They cover pain, technical validation, launch attention, implementation behavior, and Q&A friction.
- They do not require expensive enterprise agreements to build the first system.

Required platform capabilities:

- source connectors
- cursor-based ingestion
- idempotent item storage
- source-level rate limiter
- evidence extraction
- deduplication
- deletion/update handling where required
- normalized evidence packets for the Corroboration Engine
- source capability declarations for the Source Enablement Recommender

## Phase 2: Intent And Education

Producers:

- Polymarket
- financial market data, when public-market context matters
- Google Custom Search
- Google Trends API alpha, if accepted
- YouTube Data API
- npm / PyPI

Why:

- Polymarket adds money-backed expectations for resolvable event signals.
- financial market data adds capital-market response for public companies, sectors, ETFs, and macro-sensitive themes.
- Search adds active intent.
- YouTube adds education/review/tutorial behavior.
- Package registries add implementation adoption for developer markets.

Main engineering concern:

- Quota control, licensing, and signal interpretation become central. YouTube search and Google Custom Search can burn budget quickly. Polymarket prices require liquidity, spread, holder concentration, and market-wording checks before they are trusted. Stock-price data requires benchmark normalization and should be treated as market response, not causality.

## Phase 3: Amplification And Economic Validation

Producers:

- X/Twitter
- G2
- jobs data
- company/funding/procurement data

Why:

- X adds narrative spread.
- G2 and jobs add buyer/organizational validation.
- SEC, procurement, and funding sources can validate economic commitment.

Main engineering concern:

- Contracting, data rights, and cost management become more important than API mechanics.

## Customer-Opt-In Producers

Producers:

- Slack
- Discord
- Telegram

Why:

- These are valuable for private community/workspace signal intelligence.
- They should be integrated only when the customer owns or controls the relevant community/workspace/channel.

Product pattern:

```text
Connect workspace/server/channel -> define allowed sources -> ingest only consented content -> expose evidence to workspace owner/admin
```

## Partner-Gated Producers

Producers:

- LinkedIn
- TikTok
- Meta Instagram/Facebook/Threads
- broad jobs feeds
- G2, depending on account

Approach:

- Track these as strategic integrations.
- Do not make MVP value dependent on them.
- Build the connector interface so these can be added later when access is secured.

## Connector Architecture Guidance

Every connector should expose the same internal contract:

```text
source_id
source_type
native_id
native_url
author_id
author_display
community_or_container
created_at
updated_at
ingested_at
text
title
metrics
language
thread_id
parent_id
signal_candidates
evidence_fragments
permission_scope
retention_policy
raw_payload_pointer
```

Every connector should also declare:

- official source URL
- auth model
- rate limit model
- cost model
- allowed storage model
- deletion or compliance handling
- historical backfill ability
- real-time ability
- confidence and manipulation risk
- features unlocked
- features lost if disabled
- setup requirements
- expected validation profiles served

## Corroboration Engine Dependency

Producer integrations should feed the Corroboration Engine rather than only a global feed or dashboard. The engine will use normalized evidence packets, source-layer metadata, producer constraints, baselines, and source priors to decide whether a candidate signal is single-source noise, cross-community discussion, cross-source validation, behavior validation, economic validation, or contradicted/debunked.

Producer integrations should also feed the Source Enablement Recommender. Each producer must declare what evidence it can add, what gaps it fills, what access is required, and what confidence ceiling applies if the node is disabled or gated.

See:

- `../../corroboration-engine/README.md`
- `../../corroboration-engine/CORROBORATION_ENGINE_INTEGRATION.md`
- `../../corroboration-engine/PRODUCER_ROUTING_AND_SOURCES.md`
