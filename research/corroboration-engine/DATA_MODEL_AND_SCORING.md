# Data Model And Scoring

Last checked: 2026-04-18

## Design Goal

The data model should let Signals answer three questions:

1. What evidence supports or contradicts this signal?
2. How independent is that evidence?
3. Why did the system assign this confidence level?

The model should be built around evidence packets, not producer-specific payloads.

## Core Entities

### `signals`

Represents a candidate or validated signal.

```text
id
topic_label
description
canonical_terms
candidate_type
status
first_detected_at
last_seen_at
origin_producer_id
origin_evidence_id
current_corroboration_score
current_corroboration_stage
current_confidence_band
created_at
updated_at
```

### `signal_aliases`

Stores queryable aliases and excluded terms.

```text
id
signal_id
alias_text
alias_type
source
confidence
is_active
negative_filter
created_at
updated_at
```

Alias types:

- product name
- company name
- person name
- phrase
- acronym
- domain
- repository
- package
- competitor
- misspelling
- disambiguation exclusion

### `producer_queries`

Stores every query the engine asks a producer to run.

```text
id
signal_id
producer_id
query_text
query_params
query_window_start
query_window_end
purpose
status
cost_estimate
quota_bucket
started_at
completed_at
error
```

Purposes:

- origin expansion
- validation
- contradiction search
- baseline calculation
- backfill
- follow-up watch

### `evidence_items`

Stores normalized evidence packets.

```text
id
signal_id
producer_query_id
producer_id
source_type
source_layer
native_id
native_url
canonical_url
title
text_excerpt
language
geo
author_or_actor_id
author_or_actor_display
community_or_container
created_at_source
observed_at
updated_at_source
metrics_json
entities_json
claims_json
urls_json
raw_payload_pointer
permission_scope
retention_policy
content_hash
semantic_hash
```

### `evidence_groups`

Clusters evidence that appears to share an origin, actor, URL, source, or syndication path.

```text
id
signal_id
group_type
root_url
root_actor
root_organization
root_thread
first_seen_at
source_layer
independence_weight
duplication_risk
notes
```

Group types:

- exact duplicate
- syndicated article
- same thread
- same author
- same organization
- same launch campaign
- same repository/project
- same external URL
- independent

### `evidence_group_members`

```text
group_id
evidence_item_id
membership_reason
confidence
```

### `source_priors`

Stores source-level prior weights.

```text
id
producer_id
source_type
source_layer
category
reliability_prior
manipulation_risk_prior
freshness_lag_minutes
historical_depth
access_stability
cost_class
notes
updated_at
```

These values should be visible and editable. They should not be hidden model weights in early versions.

### `baselines`

Stores historical norms.

```text
id
baseline_scope
scope_id
metric_name
window_size
time_bucket
mean_value
median_value
stddev_value
percentile_75
percentile_90
percentile_95
seasonality_profile
computed_at
```

Baseline scopes:

- producer
- community
- query
- entity
- topic category
- source layer
- language
- geography

### `corroboration_runs`

Stores each run.

```text
id
signal_id
run_started_at
run_completed_at
window_start
window_end
engine_version
query_plan_version
score
stage
confidence_band
summary
positive_factors_json
negative_factors_json
missing_evidence_json
contradictions_json
recommended_next_checks_json
```

### `corroboration_features`

Stores score inputs for explainability and evaluation.

```text
id
corroboration_run_id
feature_name
feature_value
feature_weight
feature_contribution
feature_direction
explanation
```

### `human_labels`

Stores analyst feedback.

```text
id
signal_id
corroboration_run_id
label
label_reason
analyst_id
created_at
```

Labels:

- real signal
- false positive
- duplicate
- too early
- already mainstream
- manipulated
- ambiguous entity
- wrong query
- wrong source cluster
- needs follow-up

### `source_nodes`

Stores the capability declaration for each source node.

```text
id
node_label
source_layer
status
features_unlocked_json
features_lost_if_disabled_json
auth_required
access_state
cost_model
compliance_risk
freshness
historical_depth
quality_prior
redundancy_group
updated_at
```

### `enablement_recommendations`

Stores "what to enable next" recommendations.

```text
id
signal_id
corroboration_run_id
node_id
recommendation_type
rank
enablement_score
expected_lift
fills_gaps_json
reason
unlocks_json
requirements_json
risks_json
affected_signal_count
created_at
```

Recommendation types:

- enable_now
- configure_first
- request_access
- upgrade_plan
- keep_disabled
- not_relevant
- wait_for_signal

## Feature Model

The engine should compute feature families, then combine them into a visible score.

### Source Independence

Measures how many independent evidence groups support the signal.

Inputs:

- number of independent groups
- source-layer diversity
- actor diversity
- community diversity
- duplicate/syndication clusters

Example:

```text
source_independence =
  weighted_independent_groups
  / max_expected_groups_for_profile
```

### Layer Progression

Measures whether the signal moves through expected layers.

Layers:

1. conversation
2. social/news amplification
3. search/intent
4. education/review/tutorial
5. implementation/adoption
6. buyer/economic commitment
7. money-backed expectation
8. capital-market response

Not all signals need all layers. The expected profile determines which layers matter.

### Baseline Deviation

Measures whether current evidence exceeds historical norms.

Useful transforms:

- percentile rank
- z-score, with caps for outliers
- week-over-week delta
- velocity
- acceleration
- sustained days above baseline

### Semantic Agreement

Measures whether evidence items are about the same thing.

Inputs:

- entity overlap
- phrase overlap
- embedding similarity
- claim similarity
- URL/domain overlap
- taxonomy/category match

This should penalize broad ambiguous terms. For example, "agents" could refer to AI agents, real estate agents, customer service agents, or sports agents.

### Evidence Specificity

Scores whether the evidence contains actionable detail.

High specificity:

- "We are replacing X with Y because pricing changed."
- "This package solves token refresh bugs in Next.js."
- "Hiring 12 people for Snowflake migration."

Low specificity:

- "This is cool."
- "Everyone is talking about it."
- "Big news coming."

### Actor Quality

Weights the source actor or community.

Possible inputs:

- domain expertise
- history of useful posts
- community relevance
- organizational authority
- verified identity where available
- recency and consistency

This should not become a popularity-only metric. A low-follower domain expert can be more valuable than a generic influencer.

### Contradiction And Debunking

Detects evidence that weakens the candidate.

Inputs:

- fact-check results for factual claims
- high-quality rebuttals
- negative reviews
- source corrections
- official denials
- semantic disagreement
- evidence that the trend is old or declining

For factual or contentious narratives, Google Fact Check Tools and ClaimReview markup can be used as a contradiction/debunk source.

### Missing Expected Evidence

Scores the absence of evidence the profile expects.

Examples:

- Developer-tool candidate with no GitHub/Stack Exchange/package movement.
- Consumer trend with no search or video movement.
- B2B demand signal with no jobs, reviews, vendor pages, or procurement trace.
- Public-company rumor with no SEC, company, or reliable news corroboration.

Absence should not always be fatal. Some signals are genuinely early. It should affect stage and confidence.

## Scoring Structure

Use a decomposed score in V0:

```text
corroboration_score =
  source_independence_component
  + layer_progression_component
  + baseline_deviation_component
  + semantic_agreement_component
  + evidence_specificity_component
  + actor_quality_component
  + durability_component
  + source_reliability_component
  - duplication_penalty
  - manipulation_risk_penalty
  - contradiction_penalty
  - missing_expected_evidence_penalty
```

Recommended score range: 0 to 100.

Suggested default bands:

| Score | Band | Meaning |
|---:|---|---|
| 0-24 | low | Evidence is weak, ambiguous, stale, or contradicted. |
| 25-44 | watch | Interesting candidate. Needs scheduled follow-up. |
| 45-64 | medium | Enough corroboration to show in the dashboard. |
| 65-84 | high | Strong independent validation. |
| 85-100 | critical | Strong, fast-moving, and likely actionable. |

## Stage Assignment

Score and stage are separate.

Example: a signal can have a high single-source score but still be `single_source_signal` until independent validation appears.

Stages:

| Stage | Required condition |
|---|---|
| `unvalidated_candidate` | One origin candidate, little or no supporting evidence. |
| `single_source_signal` | Strong evidence from one producer or one source layer. |
| `cross_community_signal` | Multiple independent communities in the same broad layer. |
| `cross_source_validated` | Independent evidence across at least two source layers. |
| `behavior_validated` | Search, tutorial, implementation, package, review, or usage behavior appears. |
| `economic_validated` | Jobs, procurement, funding, filings, buyer reviews, or budget signals appear. |
| `contradicted_or_debunked` | High-quality contradictory evidence dominates. |

## Example: Developer Tool Pain

Candidate:

```text
"Teams are struggling with OAuth debugging in AI agent workflows."
```

Evidence:

- Reddit thread in a developer community
- HN discussion linking to a new debugging tool
- Stack Overflow questions with related errors
- GitHub issues in multiple repos
- new npm package with rising downloads
- Google Custom Search results showing tutorials
- no Google Trends lift yet

Likely output:

```text
score: 68
stage: behavior_validated
confidence_band: high

positive factors:
- independent developer communities
- implementation artifacts exist
- tutorial/docs behavior is appearing
- source evidence is semantically aligned

negative factors:
- search trend is not broad enough yet
- no buyer/economic evidence
```

## Example: Media Narrative

Candidate:

```text
"A claim about a company policy change is spreading."
```

Evidence:

- one viral X post
- several articles based on the same post
- Reddit discussion
- Google Fact Check Tools returns a fact-check with a negative rating
- official company page contradicts the claim

Likely output:

```text
score: 22
stage: contradicted_or_debunked
confidence_band: low

positive factors:
- high conversation volume

negative factors:
- duplicate amplification from one origin
- fact-check contradiction
- official source contradiction
```

## Evaluation Metrics

Track quality over time using analyst and outcome feedback.

Primary metrics:

- precision at top K surfaced signals
- analyst acceptance rate
- false positive rate
- false negative review sample rate
- time-to-detection
- time-to-corroboration
- source-layer contribution by signal type
- average explanation usefulness rating

Secondary metrics:

- query cost per accepted signal
- producer quota burn per accepted signal
- duplicate cluster rate
- contradiction miss rate
- profile-specific missing evidence rate
- percentage of signals requiring manual alias correction

## Versioning

Every score should store:

- engine version
- feature version
- query plan version
- producer connector version
- source priors version
- baseline snapshot timestamp

This is necessary because current API access, quotas, and source behavior change over time.

## Sources

- W3C PROV data model: https://www.w3.org/TR/prov-dm/
- Schema.org ClaimReview: https://schema.org/ClaimReview
- Google Fact Check Tools API REST reference: https://developers.google.com/fact-check/tools/api/reference/rest/
- Google Fact Check claims search method: https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/search
