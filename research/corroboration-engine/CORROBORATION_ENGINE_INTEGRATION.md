# Corroboration Engine Integration

Last checked: 2026-04-18

## Purpose

The Corroboration Engine is the part of Signals that answers:

> "Is this signal real, independent, growing, and validated by the kinds of sources we would expect for this topic?"

It should sit after candidate discovery and before final ranking, alerting, and analyst-facing recommendations.

The engine should not replace producer-specific scoring. A Reddit connector can still score velocity, comment quality, and community fit. The Corroboration Engine uses those producer-level observations as evidence and asks whether the broader internet supports, contradicts, or fails to validate the candidate.

## Why We Need It

Raw internet data is noisy:

- Many mentions are duplicates, reposts, syndications, SEO pages, affiliate content, bot activity, or one-community bursts.
- Some high-value signals begin with tiny volume and would be missed by popularity metrics.
- Different platforms represent different kinds of intent. Reddit conversation is not the same as Google Search demand, GitHub implementation, Stack Exchange friction, G2 buyer interest, or job-market commitment.
- Some topics should produce specific validation paths. If those paths do not appear, confidence should fall.

Signals should therefore rank by corroborated momentum, not raw mentions.

## System Position

```text
Producers
  -> Candidate Signal Extractor
  -> Corroboration Engine
  -> Signal Ranker
  -> Dashboard / Alerts / Analyst Workflow
```

The engine receives candidate signals and evidence already observed by producers. It decides what additional checks to run, normalizes the returned evidence, calculates corroboration features, and produces an explainable result.

## Definition

A candidate is corroborated when independent sources, across expected signal layers, show semantically related evidence within a relevant time window.

Corroboration is not just "more mentions." It is a judgment over:

- source independence
- platform-layer diversity
- semantic agreement
- temporal progression
- baseline deviation
- actor/source quality
- evidence specificity
- contradiction or debunking
- missing expected validation
- manipulation risk

## Integration Contract

Every producer should output normalized observations into a common evidence packet format.

```text
evidence_id
signal_id
producer_id
source_type
source_layer
native_id
native_url
canonical_url
observed_at
created_at
updated_at
author_or_actor_id
author_or_actor_display
community_or_container
title
text_excerpt
language
geo
metrics
entities
claims
urls
query_used
retrieval_method
permission_scope
retention_policy
raw_payload_pointer
provenance
```

This follows the spirit of the W3C PROV model: each packet should preserve the entity observed, the collection activity that produced it, and the responsible source/agent so trust and reliability can be assessed later.

## Engine Components

### 1. Candidate Signal Queue

Stores candidate signals emitted by discovery producers.

Candidate fields:

```text
signal_id
topic_label
description
seed_terms
entities
source_candidates
origin_evidence_ids
initial_score
detected_at
candidate_type
expected_validation_profile
```

The `expected_validation_profile` is critical. A developer-tool signal should be checked differently from a consumer-brand signal, a political narrative, a health claim, or a B2B buying signal.

### 2. Query And Entity Expansion

Generates search/query bundles for corroboration.

Inputs:

- seed phrase
- aliases
- entity names
- product names
- domain names
- repository names
- package names
- likely misspellings
- related pain phrases
- competitor terms
- excluded terms

Outputs:

```text
canonical_topic
query_bundle
entity_bundle
negative_filters
platform_specific_queries
```

This should be deterministic and inspectable in V0. Analysts should be able to see which queries were used and remove bad aliases.

### 3. Producer Router

Chooses which sources to query based on:

- signal type
- current maturity stage
- expected validation profile
- cost/quota budget
- freshness requirement
- producer availability
- legal and retention constraints

Example:

```text
Candidate: "developers complain about OAuth debugging pain"

Route first:
- Reddit
- Hacker News
- Stack Exchange
- GitHub
- Google Custom Search

Route if confidence rises:
- Google Trends
- YouTube
- npm/PyPI
- Product Hunt
- Polymarket, if the candidate maps to a resolvable event market

Route later:
- jobs data
- G2
- company/procurement/funding data
```

### 4. Evidence Normalizer

Converts producer-specific payloads into evidence packets.

It should preserve raw payload references but keep the scoring surface stable. The ranker should not need to know whether a metric came from Reddit upvotes, HN points, GitHub stars, Product Hunt votes, Polymarket price movement, Stack Exchange answers, search result count proxies, or pageview deltas.

### 5. Baseline Store

Stores expected historical behavior by source, query, entity, community, and category.

Without baselines, the system cannot tell whether 30 mentions is meaningful.

Baselines should include:

- normal volume
- normal velocity
- normal engagement
- seasonality
- community-specific norms
- source-specific lag
- typical spam/manipulation rate
- query ambiguity risk

### 6. Independence And Deduplication Engine

Detects whether evidence items are truly independent.

Deduplication targets:

- exact duplicate URLs
- syndicated articles
- reposted social links
- copied launch copy
- repeated affiliate pages
- same author across multiple venues
- same organization publishing multiple pages
- same thread cross-posted into multiple communities

Independence targets:

- different communities
- different actors
- different source layers
- different content formats
- different incentives
- independent temporal origins

This component should return clusters, not just remove duplicates. Duplicate clusters are still useful because reposting can indicate propagation, but they should not count as independent validation.

### 7. Feature Extractor

Produces scoring features from evidence packets.

Core features:

- `independent_source_count`
- `source_layer_count`
- `conversation_velocity`
- `search_interest_delta`
- `implementation_activity_delta`
- `economic_validation_presence`
- `semantic_agreement`
- `specificity_score`
- `actor_quality_score`
- `baseline_deviation`
- `temporal_alignment`
- `contradiction_rate`
- `known_debunk_presence`
- `spam_or_manipulation_risk`
- `expected_evidence_missing_count`

### 8. Corroboration Scorer

Returns a transparent score and a stage label.

Recommended stage labels:

1. `unvalidated_candidate`
2. `single_source_signal`
3. `cross_community_signal`
4. `cross_source_validated`
5. `behavior_validated`
6. `economic_validated`
7. `contradicted_or_debunked`

The score should be decomposed into components so the UI can explain it.

### 9. Explanation Builder

Creates analyst-readable evidence summaries:

```text
Why confidence increased:
- Reddit volume is 3.2x the community baseline.
- Hacker News discussion appeared within 18 hours of Reddit origin.
- GitHub repositories mentioning the same problem increased over 14 days.
- Google Search results show new tutorials and docs pages.

Why confidence is limited:
- No measurable search-interest lift yet.
- Product Hunt evidence is absent.
- Two high-engagement articles are syndicated from the same source.
```

### 10. Feedback Loop

Analyst decisions should be stored as labels:

- accepted as real signal
- rejected as noise
- too early
- already mainstream
- manipulated
- ambiguous entity
- wrong topic cluster
- needs source expansion

These labels will later train weights, routing decisions, and alert thresholds.

## Corroboration Logic

The engine should treat every candidate as a hypothesis.

```text
Hypothesis:
People are increasingly discussing and acting on topic X.

Evidence needed:
- origin or pain discussion
- independent spread
- intent or education behavior
- implementation or adoption behavior
- economic behavior, if relevant
- absence of contradiction or debunking
```

Different signal types need different evidence:

| Signal type | Strong early evidence | Strong corroboration | Weakness if missing |
|---|---|---|---|
| Developer tool pain | Reddit, HN, Stack Exchange | GitHub, package registries, docs/tutorial search | No implementation behavior |
| Consumer product trend | TikTok, YouTube, Reddit | Search/Trends, reviews, app stores | No intent or purchase/review behavior |
| B2B buying pain | Reddit, LinkedIn, forums | G2, jobs, procurement, vendor pages | No buyer or org commitment |
| News narrative | X, Reddit, news, GDELT | Google Search, Wikipedia, mainstream outlets | Only one amplification cluster |
| Event expectation | Polymarket, news, Reddit, X | search/news/social alignment, official sources, resolution evidence | No liquid market or no external corroboration |
| Public-market signal | news, filings, Reddit, search | stock/ETF abnormal return, volume, sector-relative movement | No ticker/basket mapping or no market response |
| Scientific/technical topic | HN, Reddit, arXiv/OpenAlex/Crossref | GitHub, citations, institutional pages | No research or implementation trail |
| Public company signal | News/social chatter | SEC filings, earnings docs, jobs, procurement | No primary-source business evidence |

## Independence Model

The engine should assign evidence to independence groups:

```text
group_id
group_type
source_layer
root_url
root_actor
root_organization
root_thread
first_seen_at
evidence_ids
independence_weight
```

Examples:

- Five articles republishing a wire story = one media evidence group with low independence.
- Three Reddit threads in unrelated communities with different authors = three conversation groups.
- One HN thread linking to the original Reddit post = weak independence but useful propagation.
- A GitHub issue from a different project describing the same pain = stronger implementation evidence.
- A Stack Overflow question and a GitHub issue from the same author on the same day = partially independent.

## Expected Validation Profiles

Each candidate should carry a profile that tells the engine what evidence to seek.

### Developer / Technical Profile

Primary checks:

- Reddit and Hacker News for pain/origin
- Stack Exchange for implementation friction
- GitHub Search for repos, issues, commits, docs
- npm/PyPI for package activity if applicable
- Google Custom Search for docs/tutorials/blogs
- Google Trends when query volume is high enough

Validation:

- implementation evidence matters more than general social volume
- technical specificity matters more than emotional language
- source independence across communities matters strongly

### Consumer Attention Profile

Primary checks:

- Reddit
- YouTube
- TikTok, if access exists
- Google Trends
- Google Custom Search
- app store reviews, if relevant
- Wikipedia Pageviews, if entity is public enough

Validation:

- search intent and creator/tutorial/review behavior are strong
- generic media mentions alone are weaker
- visual/social virality is high-risk without intent corroboration

### B2B / Enterprise Profile

Primary checks:

- Reddit niche communities
- Stack Exchange or technical forums
- LinkedIn, if partner access exists
- G2 or review sources
- jobs data
- company websites
- procurement/funding/SEC data

Validation:

- buyer-language evidence and org commitment matter more than raw chatter
- jobs/procurement/filings can validate durable demand
- gated sources will shape coverage quality

### Narrative / Media Profile

Primary checks:

- Reddit
- X, if licensed
- GDELT or news index
- Google Custom Search
- Google Trends
- Wikipedia Pageviews
- Fact Check Tools API for claims/debunks when the signal is factual or contentious

Validation:

- syndication and duplicate propagation must be discounted
- contradiction/debunking should be explicit in the score
- source chronology matters: origin vs amplification vs institutional pickup

## Engine Output

The engine should write one corroboration run per candidate and window.

```text
corroboration_run_id
signal_id
run_started_at
run_completed_at
window_start
window_end
score
stage
confidence_band
summary
positive_factors
negative_factors
missing_expected_evidence
contradictions
producer_queries_run
evidence_item_ids
feature_values
recommended_next_checks
```

The run should also expose enablement gaps for the Source Enablement Recommender:

```text
disabled_nodes_that_would_help
gated_nodes_that_would_help
required_configuration
confidence_ceiling_reason
missing_capabilities
```

Confidence bands:

- `low`: interesting but not enough support
- `watch`: early evidence, schedule follow-up
- `medium`: enough independent evidence for dashboard surfacing
- `high`: strong cross-layer validation
- `critical`: fast-moving and high-confidence signal requiring alert

## Dashboard Integration

Every signal detail page should include a Corroboration tab.

Recommended visual modules:

1. Corroboration Ladder
   Shows the signal's maturity from candidate to economic validation.

2. Evidence Map
   A network or matrix of evidence groups by producer and source layer.

3. Source Independence Matrix
   Separates "many mentions" from "many independent origins."

4. Timeline With Layer Bands
   Shows whether conversation preceded search, implementation, media, and economic validation.

5. Missing Validation Panel
   Shows what evidence was expected but not found.

6. Contradiction Panel
   Shows fact-checks, debunks, negative evidence, or semantic disagreement.

7. Query Plan
   Shows the exact queries and aliases used for corroboration, plus what will be checked next.

8. What To Enable Next
   Shows which disabled, gated, or unconfigured source nodes would most improve confidence, what evidence each would add, and what requirements or risks are attached.

## Operating Principle

The Corroboration Engine should be conservative by default:

- promote signals with independent cross-layer evidence
- keep single-source bursts in watch state
- penalize duplicate amplification
- explicitly show uncertainty
- preserve provenance for every score
- make it easy for analysts to correct bad clustering or bad aliases

## Sources

- W3C PROV data model: https://www.w3.org/TR/prov-dm/
- Schema.org ClaimReview: https://schema.org/ClaimReview
- Google Fact Check Tools API: https://developers.google.com/fact-check/tools/api/
- Google Fact Check Tools API REST reference: https://developers.google.com/fact-check/tools/api/reference/rest/
- Google Trends API alpha: https://developers.google.com/search/apis/trends
- Google Custom Search JSON API: https://developers.google.com/custom-search/v1/overview
- Polymarket API overview: https://docs.polymarket.com/api-reference
- Polymarket market data overview: https://docs.polymarket.com/market-data/overview
- Alpha Vantage API documentation: https://www.alphavantage.co/documentation/
- Polygon/Massive stock aggregates API: https://polygon.io/docs/rest/stocks/aggregates/custom-bars
- Wikimedia Pageviews API: https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/concepts/page-views.html
- GDELT DOC 2.0 API: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/amp/
- GitHub REST API rate limits: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- Stack Exchange API throttles: https://api.stackexchange.com/docs/throttle
- Reddit Data API Wiki: https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
