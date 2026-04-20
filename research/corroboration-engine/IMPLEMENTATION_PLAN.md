# Implementation Plan

Last checked: 2026-04-18

## Goal

Integrate the Corroboration Engine into Signals as a validation layer that improves ranking quality and makes confidence explainable.

## Target Architecture

```text
Producer Connectors
  -> Raw Producer Store
  -> Evidence Normalizer
  -> Candidate Signal Extractor
  -> Corroboration Queue
  -> Query And Entity Expansion
  -> Producer Router
  -> Corroboration Runs
  -> Signal Ranker
  -> Dashboard / Alerts
```

## V0: Manual-Assist Corroboration

Purpose:

- prove the concept with transparent scoring
- keep implementation small
- generate analyst labels for later automation

Build:

- evidence packet schema
- candidate queue
- source layer taxonomy
- manual query plan per candidate
- deterministic corroboration score
- analyst feedback labels
- signal detail Corroboration tab
- what-to-enable-next recommendations based on current evidence gaps

Use sources:

- Reddit
- Hacker News
- GitHub
- Stack Exchange
- Product Hunt
- Polymarket
- financial market data, for public-company and sector signals
- Google Custom Search
- manual Google Trends checks if API access is unavailable
- GDELT or news/web index
- Wikimedia Pageviews for public-interest entities

Exit criteria:

- each surfaced signal has an explainable confidence band
- analyst can inspect evidence and missing validation
- system can distinguish single-source bursts from cross-source validation

## V1: Automated Routing

Purpose:

- automatically decide which producers to query for each candidate
- reduce quota waste
- make missing evidence explicit

Build:

- expected validation profiles
- producer router
- source priors
- producer availability/cost/rate-limit state
- automated follow-up scheduling
- duplicate and independence clustering
- contradiction checks for narrative/claim candidates

Add sources:

- Google Trends API if access is granted
- Polymarket WebSocket monitoring for watched event markets
- delayed or daily stock-price monitoring for watched public-market baskets
- Google Fact Check Tools API
- Wikimedia Pageviews API
- Common Crawl for historical existence checks
- OpenAlex/Crossref for research profiles

Exit criteria:

- router picks producer checks by signal type
- score changes are traceable to feature contributions
- duplicate amplification is visibly discounted
- contradiction checks are visible in the UI
- dashboard shows which disabled or gated nodes would most improve confidence and why

## V2: Baselines And Outcome Learning

Purpose:

- compare current movement against historical norms
- use analyst labels to improve scoring and routing

Build:

- baseline store
- community/source/category baselines
- score versioning
- outcome evaluation jobs
- analyst acceptance metrics
- profile-specific calibration

Add:

- jobs data if accessible
- review/app store data
- procurement/company/funding data for economic validation

Exit criteria:

- system can explain why a signal is unusual for its source/community
- false positives are measured by source and signal type
- scoring weights can be adjusted with evidence

## V3: Predictive Corroboration

Purpose:

- predict which early candidates are likely to become real signals
- optimize collection cost and alert timing

Build:

- adaptive routing policy
- learned source priors
- learned expected validation paths
- time-to-validation forecasts
- alert thresholds by customer context

Do not start here. V3 needs V0-V2 labels and run history.

## Dashboard Requirements

### Signal Detail: Corroboration Tab

Required modules:

- Corroboration Ladder
- Confidence Breakdown
- Evidence Map
- Source Independence Matrix
- Timeline With Layer Bands
- Missing Validation Panel
- Contradiction Panel
- Query Plan
- Analyst Feedback Controls

### Corroboration Ladder

Show stage progression:

```text
Candidate -> Single Source -> Cross Community -> Cross Source -> Behavior -> Economic
```

The current stage should be clear. Completed stages should show supporting evidence counts.

### Confidence Breakdown

Show score contributions:

```text
Source independence      +18
Layer progression        +12
Baseline deviation       +10
Semantic agreement       +8
Evidence specificity     +7
Duplication penalty      -6
Missing expected proof   -9
Contradiction penalty     0
```

### Evidence Map

Show:

- producer
- source layer
- evidence group
- independence weight
- timestamp
- link to source or stored citation

### Missing Validation Panel

Example:

```text
Expected but not found:
- no GitHub implementation evidence
- no Stack Exchange troubleshooting activity
- no broad search lift

Interpretation:
This is still an early conversation signal. Keep in watch state.
```

### Contradiction Panel

Show:

- fact-checks
- official rebuttals
- negative primary-source evidence
- semantic disagreement
- high-quality skeptical discussion

## Backend Tasks

1. Add normalized evidence packet storage.
2. Add source-layer taxonomy.
3. Add signal alias table.
4. Add corroboration queue.
5. Add manual query plan runner.
6. Add deterministic feature extractor.
7. Add score decomposition.
8. Add evidence grouping and duplication detection.
9. Add source priors.
10. Add dashboard API endpoint for corroboration details.
11. Add analyst labels.
12. Add scheduled follow-up runs for watch signals.
13. Add Source Enablement Recommender output for disabled, gated, or unconfigured nodes.

## Suggested Internal APIs

### Submit Candidate

```text
POST /signals/candidates
```

Input:

```json
{
  "topic_label": "OAuth debugging pain in AI agent workflows",
  "seed_terms": ["oauth debugging", "ai agents", "token refresh"],
  "origin_evidence_ids": ["ev_123"],
  "candidate_type": "developer_tool_pain"
}
```

### Run Corroboration

```text
POST /signals/{signal_id}/corroboration-runs
```

Input:

```json
{
  "mode": "targeted",
  "window_days": 14,
  "budget_class": "low"
}
```

### Get Corroboration Detail

```text
GET /signals/{signal_id}/corroboration
```

Returns:

```json
{
  "score": 68,
  "stage": "behavior_validated",
  "confidence_band": "high",
  "summary": "...",
  "features": [],
  "evidence_groups": [],
  "missing_expected_evidence": [],
  "contradictions": [],
  "query_plan": [],
  "enablement_recommendations": []
}
```

## Product Rules

1. Never show a score without showing why.
2. Never treat duplicate syndication as independent validation.
3. Never promote a signal to high confidence from one source layer alone.
4. Always distinguish "not found" from "not checked."
5. Always show source and query provenance.
6. Always preserve policy constraints from the originating producer.
7. Always let analysts correct aliases and evidence grouping.

## Operational Risks

### API Access Risk

Some high-value sources are gated, paid, or alpha-only. The system should not depend on any one gated source for core value.

Mitigation:

- define provider interfaces
- support manual checks in V0
- use fallbacks for broad web/news/search
- expose "not checked because access unavailable"

### Quota And Cost Risk

Search, video, social, and commercial data APIs can become expensive or limited.

Mitigation:

- route by expected value
- cache results
- schedule follow-up only for watch-worthy candidates
- store producer rate-limit state
- estimate query cost before running

### False Corroboration Risk

The engine may mistake duplicated content for independent validation.

Mitigation:

- evidence grouping
- canonical URL extraction
- content hashing
- semantic hashing
- organization/domain clustering
- visible independence weight

### Ambiguity Risk

Topic aliases can match unrelated concepts.

Mitigation:

- negative filters
- entity disambiguation
- analyst alias review
- semantic agreement threshold
- profile-specific query templates

### Compliance Risk

Each source has different retention, deletion, display, and commercial-use constraints.

Mitigation:

- store permission scope and retention policy per evidence item
- route only through approved connectors
- maintain connector compliance notes
- implement deletion/update handling for sources requiring it

## Open Decisions

1. Which database should store evidence packets and feature history?
2. Should raw payloads be retained, or only normalized metadata and source pointers?
3. What is the initial set of signal profiles?
4. How many confidence bands should be visible to users?
5. Should customers be able to edit source priors?
6. How should private Slack/Discord/Telegram evidence be separated from public corroboration?
7. What are the first analyst labels we want to optimize for?

## Recommended Next Step

Prototype V0 on 25 manually selected candidate signals:

- 10 developer/tooling signals
- 5 consumer/product signals
- 5 B2B/buyer-pain signals
- 5 narrative/media signals

For each candidate:

1. collect evidence packets from the V0 source set
2. assign expected validation profile
3. compute transparent score
4. have an analyst accept/reject and explain why
5. compare the analyst judgment to the score components

This will reveal which features matter before we overbuild automation.
