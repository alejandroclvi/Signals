# Source Enablement Recommender

Last checked: 2026-04-18

## Purpose

The Source Enablement Recommender answers:

```text
What should the user enable next, and why?
```

This is a critical product idea because Signals is not only a monitoring system. It is also a capability-aware intelligence system. It should understand which evidence layers are active, which are missing, which are gated, and what each missing source would contribute.

The recommender should not say:

```text
Connect more data.
```

It should say:

```text
Your current graph can detect conversation and behavior, but it cannot validate active intent.
Enable Google Search to add docs, tutorials, comparisons, and official-source discovery.
Expected lift: +11.
```

## System Position

```text
Context Engine
  -> Candidate Signals
  -> Current Node State
  -> Corroboration Engine
  -> Source Enablement Recommender
  -> Dashboard / Node Control Plane
```

The recommender sits inside the control plane and uses outputs from the Corroboration Engine, Capability Graph, source priors, and user context.

## Core Principle

The system recommends the next source by estimating **marginal intelligence value**.

```text
Which disabled or gated node would reduce uncertainty the most for this user, these signals, and the current evidence gaps?
```

The recommender should consider:

- user context
- signal profile
- missing evidence
- expected confidence lift
- number of active signals affected
- historical usefulness
- freshness value
- uniqueness of data
- cost
- access friction
- compliance risk
- redundancy
- data quality risk

## Enablement Score

Recommended V0 formula:

```text
enablement_score =
  profile_fit
  + missing_evidence_value
  + expected_confidence_lift
  + affected_signal_count
  + historical_usefulness
  + freshness_value
  + uniqueness_value
  - cost_penalty
  - access_friction_penalty
  - compliance_risk_penalty
  - redundancy_penalty
  - data_quality_risk_penalty
```

The score should be explainable. Each recommendation should show the top positive and negative factors.

## Input Model

### User Context

```text
user_type
watchlists
topics
companies
tickers
sectors
competitors
geographies
signal_profiles_enabled
risk_tolerance
budget_preference
freshness_requirement
```

Examples:

Investor context:

```text
Higher priority:
- stock prices
- SEC / primary sources
- Polymarket
- news
- Google Trends

Lower priority:
- private communities unless portfolio/customer-specific
```

Founder context:

```text
Higher priority:
- Reddit
- GitHub
- Google Search
- Product Hunt
- G2
- jobs

Lower priority:
- stock prices unless public-market context matters
```

Product team context:

```text
Higher priority:
- Reddit
- reviews
- support/community channels
- GitHub
- app stores

Lower priority:
- Polymarket unless the product is event/narrative-driven
```

Policy analyst context:

```text
Higher priority:
- news
- official sources
- Google Trends
- Polymarket
- fact checks
- public social, if licensed
```

### Signal Profile

Each signal profile has expected validation layers.

Example:

```text
Signal profile:
public_market_narrative

Expected layers:
- conversation
- intent
- expectation, if event market exists
- capital-market response
- primary truth

High-value missing nodes:
- financial market data
- SEC / primary
- Google Trends
- Polymarket
```

### Current Node State

```text
node_id
status
source_layer
features_unlocked
features_missing_if_disabled
auth_required
access_state
cost_model
compliance_risk
freshness
historical_depth
quality_prior
redundancy_group
```

Node statuses:

```text
enabled
disabled
available
gated
degraded
not_relevant
requires_configuration
```

### Current Evidence Gaps

The Corroboration Engine should emit missing evidence.

Example:

```text
missing_layers:
- intent
- primary_truth

missing_features:
- active_search_demand
- official_confirmation
- contradiction_check
```

The recommender translates these gaps into source recommendations:

```text
active_search_demand -> Google Search, Google Trends
official_confirmation -> SEC / Primary
capital_market_response -> stock prices
event_probability -> Polymarket
implementation_behavior -> GitHub, Stack Exchange, package registries
economic_commitment -> G2, jobs, procurement
```

## Recommendation Object

Every recommendation should be stored and shown as a structured object.

```json
{
  "node_id": "stock_prices",
  "node_label": "Stock Prices",
  "recommendation_type": "enable",
  "rank": 1,
  "enablement_score": 82,
  "expected_lift": 14,
  "fills_gaps": [
    "capital_market_response",
    "public_company_validation"
  ],
  "reason": "The user monitors public-market themes and the current signal maps to AI infrastructure tickers.",
  "unlocks": [
    "abnormal return",
    "relative volume",
    "sector-relative validation",
    "market contradiction"
  ],
  "requirements": [
    "market data provider",
    "ticker mapping",
    "benchmark basket"
  ],
  "risks": [
    "stock movement is noisy and should not be treated as causality"
  ],
  "status": "available"
}
```

## Recommendation Types

```text
enable_now
configure_first
request_access
upgrade_plan
keep_disabled
not_relevant
wait_for_signal
```

Examples:

### Enable Now

```text
Google Search is available and fills an intent gap.
```

### Configure First

```text
Stock Prices would help, but ticker and benchmark mappings must be configured.
```

### Request Access

```text
Google Trends would help, but official API access is gated.
```

### Keep Disabled

```text
Polymarket is not useful because there is no liquid event market for this signal.
```

### Wait For Signal

```text
Jobs data is not needed yet because the signal is still in early conversation stage.
```

## Marginal Value Examples

### Example 1: AI Infrastructure Demand

Enabled:

- Reddit
- Hacker News
- GitHub
- Polymarket
- Stock Prices

Missing:

- intent
- primary truth

Recommendations:

```text
1. Enable Google Search
   Fills: active web discovery, docs/tutorials, official pages
   Expected lift: +11

2. Enable SEC / Primary
   Fills: official confirmation, filings, contradiction checks
   Expected lift: +10

3. Request Google Trends access
   Fills: broad search-demand validation and geography
   Expected lift: access-gated
```

### Example 2: Developer Tool Pain

Enabled:

- Reddit
- Hacker News

Missing:

- behavior
- implementation friction
- search intent

Recommendations:

```text
1. Enable GitHub
   Fills: implementation artifacts and adoption behavior

2. Enable Stack Exchange
   Fills: troubleshooting and recurring technical friction

3. Enable Google Search
   Fills: docs/tutorials and broader web discovery
```

### Example 3: Public Company Rumor

Enabled:

- Reddit
- X, if licensed
- news index

Missing:

- primary truth
- capital-market response
- event expectation

Recommendations:

```text
1. Enable SEC / Primary
   Fills: official filings and contradiction checks

2. Enable Stock Prices
   Fills: market reaction and abnormal return checks

3. Enable Polymarket
   Fills: event probability only if a liquid related market exists
```

## Dashboard Behavior

The "What To Enable Next" panel should show:

```text
node status
recommendation type
expected lift
gap filled
why it matters
requirements
risks
affected signal count
```

Recommended visual labels:

```text
Enable now
Configure first
Request access
Keep disabled
Not relevant
```

The dashboard should also show disabled-node consequences:

```text
Disabled:
Stock Prices

Unavailable:
- abnormal return
- relative volume
- sector basket movement
- market confirms/ignores/contradicts label

Confidence cap:
Public-market signals cannot exceed "medium" without capital-market response or primary truth.
```

## V0 Implementation

Start with deterministic rules.

Required tables or objects:

```text
source_nodes
source_node_features
signal_profiles
profile_expected_layers
corroboration_gaps
enablement_recommendations
```

V0 scoring:

```text
profile_fit: 0-20
missing_evidence_value: 0-25
expected_confidence_lift: 0-20
affected_signal_count: 0-10
historical_usefulness: 0-10
freshness_value: 0-5
uniqueness_value: 0-10
cost_penalty: 0-10
access_friction_penalty: 0-15
compliance_risk_penalty: 0-10
redundancy_penalty: 0-10
data_quality_risk_penalty: 0-10
```

V0 does not need machine learning. It needs visible rules and good explanations.

## V1 Implementation

Use analyst feedback and observed outcomes.

Learn:

- which nodes actually improved accepted-signal rate
- which nodes often produced redundant evidence
- which nodes were expensive relative to signal value
- which user contexts benefited from each source
- which signal profiles needed which validation paths

## Product Rule

Every recommendation should complete this sentence:

```text
Enable [node] because your current graph cannot [capability],
and this source would add [evidence/features] for [signal/user context].
```

If the system cannot complete that sentence, it should not recommend the node.

