# Implementation Report: Market Signal Radar V0

Generated: 2026-04-19 08:50:06 EDT

Prepared for: Signals

Prepared by: Codex, OpenAI

Status: Market-focused MVP implementation direction

## Executive Summary

This implementation slice focuses on:

```text
Polymarket signals
market signals
stock / ETF / basket signals
```

The product slice should be:

```text
Market Signal Radar V0
```

The goal is to detect when money-backed expectations, public-market prices, and external evidence begin moving around the same theme, event, company, sector, or narrative.

This slice is not a trading bot. It is not investment advice. It is an intelligence product that helps users understand:

```text
What is being repriced?
What event or narrative is driving it?
Is the move money-backed, public-market-backed, both, or neither?
What evidence supports it?
What evidence is missing?
What should be enabled next?
```

The first build should not start with real-time trading or broad stock-market coverage. It should start with a narrow, explainable loop:

```text
Polymarket active markets
-> probability and liquidity changes
-> entity/topic/ticker mapping
-> delayed or daily stock/ETF movement
-> market signal candidate
-> divergence / confirmation labels
-> what-to-enable-next recommendation
-> market signal detail page
```

## Product Slice Name

```text
Market Signal Radar V0
```

## Primary Product Question

```text
What event, narrative, company, sector, or theme is being repriced by money-backed markets or public markets before the broader story is obvious?
```

## Target User

Primary:

```text
Investor / market researcher
```

Secondary:

```text
Founder tracking market narratives
Public-market analyst
VC / startup scout
Growth researcher
Policy analyst
Data analyst
```

## Primary Job To Be Done

```text
Find early market-moving narratives by connecting prediction-market probability changes with public-market price reactions.
```

The user wants to know:

- Which Polymarket markets are moving?
- Are the moves liquid enough to trust?
- Are related stocks, ETFs, or baskets also moving?
- Is there a confirmation or contradiction between prediction markets and stock markets?
- Which companies, sectors, or themes are implicated?
- What primary source, news, search, or social evidence is missing?
- What should be enabled next to improve confidence?

## MVP Definition

The MVP is:

```text
Detect and explain money-backed expectation changes and public-market response around mapped events, companies, sectors, and themes.
```

The MVP is not:

```text
a trading platform
an order execution system
investment advice
high-frequency market monitoring
a complete financial terminal
a generalized all-market screener
```

## First Implementation Slice

The first actual feature slice:

```text
Polymarket + Stock Response Loop V0
```

It should detect:

- probability shocks
- rising volume/open interest
- tightening or widening spreads
- order-book depth changes
- low-liquidity warnings
- event markets tied to public companies or sectors
- stock/ETF abnormal returns
- volume or volatility spikes
- market confirmation
- market contradiction
- market ignoring social/prediction hype

## Source Strategy

### Source Sequence

Recommended source order:

```text
1. Polymarket Gamma API
2. Polymarket CLOB public market data
3. Polymarket Data API
4. Financial market data, delayed or daily OHLCV
5. SEC / primary sources
6. Google Search / news index
7. Google Trends, if access exists
8. X / LinkedIn / Reddit later for social narrative context
```

### Why Polymarket First

Polymarket provides money-backed expectation signals around defined future outcomes.

It contributes:

- market discovery
- event/market metadata
- tags/categories
- probability
- price history
- order book
- spread
- trades
- open interest
- holder/activity data
- resolution outcomes later

Its best role:

```text
expectation layer
```

### Why Stock Prices Second

Stock prices and ETFs show public-market response.

They contribute:

- abnormal return
- sector-relative movement
- volume spike
- volatility change
- competitor sympathy
- basket breadth
- market confirmation or contradiction

Their best role:

```text
capital-market response layer
```

### Why SEC / Primary Sources Later

Primary sources help avoid overclaiming.

They contribute:

- official filings
- company facts
- event confirmation
- contradiction
- entity/ticker validation

### Why Search / News Later

Search and news explain what might be driving market movement.

They contribute:

- narrative discovery
- trigger identification
- official-source lookup
- news/media propagation

## Core Distinction

Polymarket and stock prices are both money-related, but they are not the same.

```text
Polymarket:
priced belief about a defined future event.

Stock prices:
market repricing of a company, sector, ETF, or basket.
```

The strongest signals happen when both layers move in a coherent way.

Example:

```text
Polymarket probability of an AI regulation event rises.
Related AI infrastructure or software stocks move abnormally.
News/search evidence begins appearing.
The system flags a market narrative forming.
```

## Signal Types

### 1. Probability Shock

Definition:

```text
A Polymarket market moves materially over a short window.
```

Features:

- probability delta
- price velocity
- price acceleration
- volume
- open interest
- spread
- liquidity

### 2. Conviction Signal

Definition:

```text
Probability moves with rising open interest, volume, and sufficient liquidity.
```

Interpretation:

The move is more credible than a thin-market price jump.

### 3. Thin-Market Warning

Definition:

```text
Large probability move, but low liquidity, wide spread, shallow depth, or concentrated holders.
```

Interpretation:

Do not over-trust the price.

### 4. Money Confirms Narrative

Definition:

```text
Polymarket reprices in the same direction as related stocks/ETFs or external evidence.
```

Interpretation:

The narrative has money-backed expectation and public-market response.

### 5. Market Divergence

Definition:

```text
Polymarket moves but related stocks/ETFs do not, or stocks move but prediction markets do not.
```

Interpretation:

The system should surface the mismatch, not force agreement.

### 6. Stock Market Confirmation

Definition:

```text
Related stock or basket shows abnormal return, volume, or volatility in the signal window.
```

Interpretation:

Public markets may be repricing the theme.

### 7. Market Ignores Hype

Definition:

```text
Social/news/prediction-market attention rises, but related public assets are flat after benchmark adjustment.
```

Interpretation:

The narrative may not be financially material, or the mapping may be weak.

### 8. Resolution Pressure

Definition:

```text
A prediction market reprices rapidly near its resolution date.
```

Interpretation:

New information may be arriving, or uncertainty is collapsing.

## Initial Market Scope

Start with market categories that can connect to public-market assets.

Recommended first categories:

```text
AI and technology
crypto regulation
macro / Fed / inflation
elections and policy with market impact
energy
defense
semiconductors
public-company event markets
```

Avoid initially:

```text
sports-only markets
celebrity markets
low-liquidity entertainment markets
ambiguous joke markets
markets with unclear resolution rules
```

## Initial Instrument Scope

Start with:

```text
SPY
QQQ
IWM
SOXX
SMH
XLK
XLE
XLF
XLI
NVDA
AMD
AVGO
MSFT
GOOGL
META
TSLA
COIN
MSTR
```

Add theme baskets later:

```text
AI infrastructure basket
crypto equities basket
semiconductor basket
defense basket
energy basket
consumer risk basket
```

## Scoring Model V0

### Polymarket Component

```text
polymarket_expectation_score =
  probability_delta
  + price_velocity
  + volume_delta
  + open_interest_delta
  + liquidity_score
  + spread_quality
  + order_book_depth
  - thin_market_penalty
  - ambiguous_wording_penalty
  - concentration_penalty
```

### Stock Market Component

```text
capital_market_response_score =
  abnormal_return_vs_index
  + abnormal_return_vs_sector
  + relative_volume
  + realized_volatility_delta
  + basket_breadth
  + competitor_sympathy_move
  - broad_market_beta_penalty
  - earnings_confound_penalty
  - macro_confound_penalty
  - weak_mapping_penalty
```

### Combined Market Signal Score

```text
market_signal_score =
  polymarket_expectation_score
  + capital_market_response_score
  + cross_layer_alignment
  + freshness
  + source_quality
  - contradiction_penalty
  - low_liquidity_penalty
  - causality_overclaim_penalty
```

### Confidence Bands

```text
low:
one weak movement or thin market only

watch:
material movement in one layer, missing corroboration

medium:
Polymarket or stock movement with enough quality and some external support

high:
Polymarket movement plus stock/ETF response plus primary/news/search support
```

## Data Model Additions

### `prediction_events`

```text
id
producer_id
native_event_id
title
description
category
tags_json
start_date
end_date
status
resolution_source
created_at_source
observed_at
updated_at
```

### `prediction_markets`

```text
id
event_id
native_market_id
question
outcomes_json
condition_id
market_address
active
closed
volume
liquidity
open_interest
end_date
resolution_source
market_wording_clarity
created_at_source
observed_at
updated_at
```

### `prediction_market_prices`

```text
id
market_id
outcome
price
midpoint
best_bid
best_ask
spread
liquidity
observed_at
source_endpoint
```

### `prediction_market_activity`

```text
id
market_id
trade_count
volume
open_interest
holder_count
large_trade_count
holder_concentration
observed_at
source_endpoint
```

### `financial_instruments`

```text
id
symbol
name
instrument_type
exchange
sector
industry
currency
active
provider_metadata_json
created_at
updated_at
```

### `instrument_price_bars`

```text
id
instrument_id
timestamp
timeframe
open
high
low
close
volume
adjusted_close
provider
is_delayed
created_at
```

### `market_baskets`

```text
id
basket_name
theme
description
benchmark_symbol
created_at
updated_at
```

### `market_basket_members`

```text
basket_id
instrument_id
weight
role
created_at
```

### `event_entity_links`

```text
id
prediction_market_id
entity_type
entity_id
symbol
company_name
theme
confidence
link_reason
created_at
```

### `market_signal_candidates`

```text
id
title
description
signal_type
status
primary_prediction_market_id
primary_basket_id
primary_instrument_id
score
confidence_band
first_seen_at
last_seen_at
created_at
updated_at
```

### `market_signal_scores`

```text
id
market_signal_id
score_version
score
confidence_band
polymarket_expectation_score
capital_market_response_score
cross_layer_alignment
liquidity_quality
spread_quality
basket_breadth
freshness
thin_market_penalty
weak_mapping_penalty
confound_penalty
created_at
```

### `market_divergence_flags`

```text
id
market_signal_id
flag_type
description
severity
evidence_json
created_at
```

Flag types:

```text
polymarket_moves_stocks_flat
stocks_move_polymarket_flat
social_hype_market_ignores
thin_market_move
sector_move_not_company_specific
macro_confound_possible
earnings_confound_possible
```

## Node Architecture

Market Signal Radar V0 uses a different node graph than Category Formation Radar.

Category Formation Radar starts with:

```text
Conversation / pain
```

Market Signal Radar starts with:

```text
Expectation / capital-market response
```

The core node path:

```text
Polymarket
-> Entity / Theme Mapping
-> Financial Market Data
-> Corroboration Engine
-> Source Enablement Recommender
-> Market Signal Dashboard
```

The complete node graph:

```text
Context Engine
-> Node Control Plane
-> Producer Mesh
-> Polymarket
-> Financial Market Data
-> Entity And Topic Graph
-> Financial Mapping Layer
-> Baseline Store
-> Corroboration Engine
-> Signal Scoring Engine
-> Source Enablement Recommender
-> Signal Story Builder
-> Dashboard
```

### Required V0 Nodes

#### Context Engine

Role:

```text
Defines the user's market context.
```

What it stores:

- watched themes
- sectors
- companies
- tickers
- ETFs
- event categories
- macro topics
- excluded terms

Why it matters:

Without context, a market move is just noise. The same event may matter to an AI infrastructure investor, a crypto researcher, or a policy analyst for different reasons.

#### Node Control Plane

Role:

```text
Controls enabled, disabled, gated, degraded, and unconfigured nodes.
```

What it tells the user:

- what is currently active
- what is unavailable
- what evidence is missing
- what source should be enabled next
- what confidence is capped by disabled nodes

#### Producer Mesh

Role:

```text
Routes collection work to producer nodes.
```

For this slice, the Producer Mesh coordinates:

- Polymarket Gamma API
- Polymarket CLOB public market data
- Polymarket Data API
- financial market data provider
- SEC / primary source later
- search/news later

#### Polymarket Node

Role:

```text
Expectation layer.
```

What it brings:

- active event markets
- market questions
- market wording
- resolution source
- probability changes
- volume
- open interest
- liquidity
- spread
- order book depth
- trade activity

What it answers:

```text
Are people risking money on a defined future outcome?
```

What it cannot prove alone:

- public-market impact
- broad public interest
- official confirmation
- causality
- product demand

#### Financial Market Data Node

Role:

```text
Capital-market response layer.
```

What it brings:

- stock prices
- ETF prices
- indices
- sector baskets
- daily or delayed OHLCV
- abnormal returns
- relative volume
- volatility movement
- basket breadth

What it answers:

```text
Are public markets repricing related companies, sectors, or assets?
```

What it cannot prove alone:

- why the move happened
- whether Polymarket caused or predicted it
- whether the move is company-specific without benchmark controls
- whether the narrative is true

#### Entity And Topic Graph

Role:

```text
Mapping layer.
```

What it brings:

- event-to-company mapping
- event-to-ticker mapping
- event-to-sector mapping
- event-to-theme mapping
- aliases
- ambiguity flags

What it answers:

```text
What does this market event map to in the real world?
```

This node is critical. Without it, Polymarket and stock prices remain disconnected.

#### Financial Mapping Layer

Role:

```text
Market interpretation layer.
```

What it brings:

- ticker baskets
- benchmarks
- ETFs
- competitors
- sector mapping
- event windows
- abnormal return calculations

What it answers:

```text
Is the market movement specific, broad, benchmark-driven, or theme-driven?
```

#### Baseline Store

Role:

```text
Normal behavior layer.
```

What it brings:

- normal probability volatility
- normal prediction-market volume
- normal spread
- normal liquidity
- normal stock return
- normal stock volume
- normal ETF movement
- normal basket behavior

What it answers:

```text
Is this move unusual?
```

#### Corroboration Engine

Role:

```text
Validation layer.
```

What it brings:

- cross-layer agreement
- missing validation
- contradiction detection
- confidence ceiling
- divergence detection

What it answers:

```text
Do prediction markets and public markets agree, disagree, or need more evidence?
```

#### Signal Scoring Engine

Role:

```text
Ranks market signal candidates.
```

What it brings:

- Polymarket expectation score
- capital-market response score
- cross-layer alignment score
- thin-market penalty
- weak-mapping penalty
- confound penalty

#### Source Enablement Recommender

Role:

```text
Control-plane intelligence.
```

What it brings:

- next source recommendation
- expected confidence lift
- gap filled
- access/setup requirements
- disabled-node consequences

What it answers:

```text
What source should we enable next to understand this move?
```

#### Market Signal Dashboard

Role:

```text
User decision surface.
```

What it brings:

- ranked market signals
- probability chart
- stock/ETF response chart
- divergence/confirmation labels
- liquidity warning
- what-to-enable-next panel

What it answers:

```text
What is moving, why might it matter, and what should I check next?
```

### Secondary Nodes

These nodes are not mandatory for V0, but they improve interpretation.

#### SEC / Primary Sources

Role:

```text
Primary Truth / Resolution.
```

Use when:

- signal maps to a public company
- event involves filings
- event involves earnings
- event involves regulation
- event involves acquisition, litigation, guidance, or disclosure

Adds:

- official filings
- company facts
- confirmation
- contradiction
- resolution evidence

#### Google Search / News Index

Role:

```text
Trigger discovery / narrative context.
```

Use when:

- Polymarket or stocks move but the cause is unclear
- the system needs articles, official pages, documents, explainers, or news triggers

Adds:

- trigger discovery
- web evidence
- official page lookup
- narrative context

#### Google Trends

Role:

```text
Public search-interest validation.
```

Use when:

- signal may have broad public attention
- the user wants search demand, geography, or seasonality

Adds:

- public interest
- search momentum
- geographic validation

#### Reddit / X / LinkedIn

Role:

```text
Social narrative / amplification.
```

Use when:

- the user wants to know whether a financial/event signal is spreading socially
- the system needs retail discussion, professional reaction, or narrative formation

Adds:

- public discussion
- narrative language
- amplification
- skepticism/backlash

### Node Categories For This Slice

Required V0:

```text
Context Engine
Node Control Plane
Producer Mesh
Polymarket
Financial Market Data
Entity And Topic Graph
Financial Mapping Layer
Baseline Store
Corroboration Engine
Signal Scoring Engine
Source Enablement Recommender
Signal Story Builder
Dashboard
```

Optional V0 / V1:

```text
SEC / Primary
Google Search / News
Google Trends
Reddit
X / LinkedIn
```

### Example Node Flow

Signal:

```text
AI regulation probability shock
```

Nodes used:

```text
Polymarket:
detects probability rising.

Entity And Topic Graph:
maps the market to AI regulation and AI infrastructure.

Financial Mapping Layer:
maps theme to NVDA, AMD, AVGO, MSFT, SOXX, QQQ.

Financial Market Data:
detects basket underperformance or abnormal movement.

Baseline Store:
checks whether the move is unusual.

Corroboration Engine:
labels the relationship as confirmation, contradiction, divergence, or unclear.

Source Enablement Recommender:
recommends Search/News or SEC/Primary if the trigger or official confirmation is missing.

Dashboard:
shows probability chart, basket chart, liquidity warning, missing evidence, and next source.
```

## Pipeline Design

### Step 1: Discover Prediction Markets

Use Polymarket Gamma API to ingest:

- active events
- markets
- tags
- categories
- end dates
- descriptions
- resolution sources
- volume/liquidity/open interest fields where available

Output:

```text
prediction_events
prediction_markets
source health records
```

### Step 2: Track Market Prices And Quality

Use CLOB public endpoints for:

- price
- midpoint
- spread
- order book
- price history

Use WebSocket later for watched markets.

Output:

```text
prediction_market_prices
liquidity_score
spread_quality
thin_market_warning
```

### Step 3: Track Activity And Conviction

Use Data API for:

- trades
- activity
- open interest
- holders
- positions where relevant

Output:

```text
prediction_market_activity
conviction_score
holder_concentration
large_trade_count
```

### Step 4: Map Events To Entities And Themes

Map markets to:

- companies
- tickers
- sectors
- ETFs
- themes
- macro categories
- public policies

Output:

```text
event_entity_links
market_baskets
financial_instruments
```

Start manually for MVP. Add automated entity linking later.

### Step 5: Ingest Financial Market Data

Use selected provider for:

- daily OHLCV
- delayed intraday bars if available
- ticker reference data
- ETFs/indices

Output:

```text
instrument_price_bars
market_basket_features
capital_market_response_features
```

### Step 6: Compute Market Signal Candidates

Generate candidates when:

- Polymarket probability delta exceeds threshold
- Polymarket volume/open interest changes materially
- stock or basket abnormal return exceeds threshold
- Polymarket and stocks move together
- Polymarket and stocks diverge

Output:

```text
market_signal_candidates
market_signal_scores
market_divergence_flags
```

### Step 7: Recommend Next Source

Use Source Enablement Recommender:

Examples:

```text
If probability moved but stock mapping is missing:
Recommend financial market data or ticker mapping.

If stock moved but event cause is unclear:
Recommend news / Google Search.

If market is company-specific:
Recommend SEC / Primary.

If broad public interest may matter:
Recommend Google Trends.

If social narrative matters:
Recommend X/Reddit/LinkedIn later.
```

### Step 8: Display In Dashboard

The first dashboard should show:

1. Ranked Market Signals
2. Market Signal Detail
3. Polymarket Probability Chart
4. Stock/ETF/Basket Response Chart
5. Divergence / Confirmation Panel
6. What To Enable Next

## Dashboard Requirements

### Ranked Market Signals

Show:

```text
signal title
signal type
score
confidence band
Polymarket probability delta
volume/open interest change
liquidity warning
mapped tickers/baskets
stock/ETF abnormal return
market reaction label
next source recommendation
```

Example rows:

```text
AI regulation probability shock
Fed cut odds repricing with bank ETF response
Crypto regulation market moves while COIN/MSTR lag
Defense policy market reprices with defense basket strength
Semiconductor export-control event moves with SOXX weakness
```

### Market Signal Detail Page

Show:

```text
market question
market wording and resolution source
probability chart
volume/open interest chart
spread/liquidity panel
mapped entities/tickers/baskets
stock/ETF response chart
benchmark-relative return
divergence/confirmation flags
missing validation
what to enable next
```

### What To Enable Next

Examples:

```text
Enable financial market data:
Adds stock/ETF response and abnormal return checks.

Enable SEC / Primary:
Adds official confirmation and filing evidence.

Enable Google Search / news:
Adds trigger discovery and narrative context.

Enable Google Trends:
Adds public search-interest validation.

Enable Reddit / X / LinkedIn:
Adds social narrative and amplification context.
```

## Example End-To-End Signal

### Candidate

```text
AI regulation probability shock
```

### Evidence

```text
Polymarket:
Probability of a defined AI regulation outcome rises from 31% to 46% over 24 hours.
Volume rises.
Open interest rises.
Spread remains tight enough to trust.

Financial market data:
AI infrastructure basket underperforms QQQ and SOXX during the same window.
Volume rises in selected basket constituents.

Missing:
official primary source
news/search trigger
Google Trends validation
```

### Interpretation

```text
Money-backed expectation and public-market response are both moving around an AI regulation narrative.
Confidence is medium until primary/news/search context is added.
```

### Recommendation

```text
Enable Google Search / news next.

Reason:
The system can see money and market movement, but it cannot yet explain the information trigger or source narrative.
```

## Implementation Tickets

### 1. Define Market Signal Radar V0 scope

Role:

Founding Full-Stack Data Systems Engineer

Priority:

High

Acceptance criteria:

- MVP is scoped to Polymarket plus delayed/daily financial market data.
- Trading and order execution are explicitly out of scope.
- First market categories are selected.
- First instrument universe is selected.
- Success criteria are documented.

### 2. Define prediction market data model

Role:

Data Platform Engineer

Priority:

High

Acceptance criteria:

- `prediction_events` schema is defined.
- `prediction_markets` schema is defined.
- `prediction_market_prices` schema is defined.
- `prediction_market_activity` schema is defined.
- Schemas preserve native Polymarket identifiers and provenance.

### 3. Implement Polymarket Gamma API ingestion

Role:

Backend Integrations Engineer

Priority:

High

Acceptance criteria:

- Active events can be ingested.
- Active markets can be ingested.
- Tags/categories are stored.
- Market wording and resolution source are stored.
- Source health and rate-limit metadata are recorded.

### 4. Implement Polymarket CLOB market-data ingestion

Role:

Backend Integrations Engineer

Priority:

High

Acceptance criteria:

- Price, midpoint, spread, and order-book data can be fetched for watched markets.
- Price observations are persisted.
- Spread quality is computed.
- Thin-market warnings can be generated.
- Trading endpoints remain out of scope.

### 5. Implement Polymarket activity ingestion

Role:

Backend Integrations Engineer

Priority:

Medium

Acceptance criteria:

- Trades/activity can be fetched.
- Open interest can be tracked where available.
- Holder/activity metadata is stored where available.
- Large trade and concentration features are defined.

### 6. Define financial instrument and basket model

Role:

Financial Data / Market Intelligence Engineer

Priority:

High

Acceptance criteria:

- `financial_instruments` schema is defined.
- `market_baskets` schema is defined.
- `market_basket_members` schema is defined.
- Initial tickers and ETFs are configured.
- Benchmarks are defined.

### 7. Implement stock/ETF OHLCV ingestion V0

Role:

Financial Data / Market Intelligence Engineer

Priority:

High

Acceptance criteria:

- Daily or delayed OHLCV ingestion works.
- Adjusted close handling is defined.
- Provider metadata is stored.
- Data is linked to instruments and baskets.
- Licensing/freshness limits are visible.

### 8. Build event-to-entity/ticker mapping V0

Role:

Search / Ranking / Applied ML Engineer

Priority:

High

Acceptance criteria:

- Markets can be manually mapped to companies, tickers, sectors, and themes.
- Mapping confidence is stored.
- Link reason is stored.
- Ambiguous mappings can be flagged.
- Mapping output feeds scoring and dashboard.

### 9. Compute Polymarket expectation features

Role:

Search / Ranking / Applied ML Engineer

Priority:

High

Acceptance criteria:

- Probability delta windows are computed.
- Volume and open-interest deltas are computed.
- Spread quality is computed.
- Liquidity score is computed.
- Thin-market penalty is computed.

### 10. Compute capital-market response features

Role:

Financial Data / Market Intelligence Engineer

Priority:

High

Acceptance criteria:

- Abnormal return versus index is computed.
- Abnormal return versus sector ETF is computed.
- Relative volume is computed.
- Basket breadth is computed.
- Market response label is generated.

### 11. Build market signal scoring V0

Role:

Search / Ranking / Applied ML Engineer

Priority:

High

Acceptance criteria:

- Combined market signal score is computed.
- Confidence band is assigned.
- Divergence flags are generated.
- Feature contributions are exposed.
- Score does not imply investment advice or causality.

### 12. Build market signal feed

Role:

Frontend Data Visualization Engineer

Priority:

High

Acceptance criteria:

- Feed shows ranked market signals.
- Rows include probability delta, volume/open interest, liquidity warning, mapped basket, market reaction label, and next source.
- User can select a signal.
- Empty/loading/error states exist.

### 13. Build market signal detail page

Role:

Frontend Data Visualization Engineer

Priority:

High

Acceptance criteria:

- Detail page shows Polymarket question and resolution source.
- Probability chart is shown.
- Liquidity/spread panel is shown.
- Stock/ETF response chart is shown.
- Divergence/confirmation flags are shown.
- What To Enable Next recommendations are shown.

### 14. Build Source Enablement recommendations for market signals

Role:

Founding Full-Stack Data Systems Engineer

Priority:

High

Acceptance criteria:

- Recommends financial market data when market response is missing.
- Recommends SEC / Primary when company/event confirmation is missing.
- Recommends Google Search/news when trigger context is missing.
- Recommends Google Trends when public search-interest validation is relevant.
- Marks social sources as useful but gated when applicable.

### 15. Create first market signal evaluation set

Role:

Search / Ranking / Applied ML Engineer

Priority:

Medium

Acceptance criteria:

- At least 25 market signal candidates are reviewed.
- Each candidate is labeled credible, thin-market noise, unmapped, contradicted, or too early.
- Review reasons are captured.
- Failure modes are summarized.

## First 30-Day Build Plan

### Week 1: Market Scope And Schemas

Build:

- market signal scope
- prediction market schemas
- financial instrument schemas
- initial source node declarations
- initial ticker/ETF universe

Research:

- Polymarket categories/tags
- source rate limits
- market data provider choice
- licensing constraints

### Week 2: Polymarket Ingestion

Build:

- Gamma API event/market ingestion
- CLOB price/spread ingestion
- market quality features
- source health records

Research:

- active market liquidity distribution
- common ambiguous market wording
- useful tags/categories

### Week 3: Stock/ETF Ingestion And Mapping

Build:

- OHLCV ingestion
- instrument/basket model
- event-to-ticker mapping
- abnormal return features

Research:

- benchmark choice
- theme basket design
- corporate action handling

### Week 4: Signal Scoring And Dashboard

Build:

- market signal scoring
- divergence flags
- ranked market signal feed
- market signal detail page
- what-to-enable-next recommendations

Research:

- false positive patterns
- thin-market failures
- stock-market confounds
- user trust language

## Success Criteria

The first implementation succeeds if a user can see:

```text
Here are prediction markets moving.
Here is whether the movement is liquid enough to care about.
Here are related stocks, ETFs, or baskets.
Here is whether public markets confirm, ignore, or contradict the move.
Here is what evidence is missing.
Here is the next source to enable.
```

Quantitative targets for V0:

```text
At least 100 active Polymarket markets ingested.
At least 25 watched markets with price/spread history.
At least 20 tickers/ETFs tracked.
At least 5 manual theme baskets configured.
At least 25 market signal candidates reviewed.
At least 5 useful market signals surfaced.
```

## Key Risks

### Low-Liquidity Prediction Markets

Risk:

Thin markets can move sharply on small trades.

Mitigation:

- require liquidity score
- show spread
- show order-book depth
- penalize low volume/open interest
- display thin-market warning

### Weak Entity/Ticker Mapping

Risk:

The system may map an event to the wrong stock or basket.

Mitigation:

- start with manual mappings
- store confidence and link reason
- show mapping in dashboard
- allow manual correction

### Causality Overclaiming

Risk:

The system may imply that a market or stock moved because of a narrative without proof.

Mitigation:

- use "market response" language
- show confound flags
- compare against benchmarks
- avoid investment advice

### Market Data Licensing

Risk:

Real-time or redistributable financial data may require paid licensing.

Mitigation:

- start with delayed or daily OHLCV
- show freshness labels
- keep derived features separate from raw redistribution
- review provider terms

### Confounding Events

Risk:

Stocks may move because of earnings, macro, analyst notes, rates, or sector rotation.

Mitigation:

- benchmark-relative returns
- sector-relative returns
- earnings proximity flags
- macro confound flags
- primary/news/search checks

## Explicit Non-Goals

Do not build these in V0:

- trade execution
- portfolio management
- personalized investment advice
- real-time high-frequency monitoring
- options data
- short interest data
- social media firehose
- fully automated entity linking
- broad all-stock screener
- crypto exchange order books

These can be considered later, but they are not required to prove the core market signal loop.

## Strategic Rationale

This slice proves a different part of the long-term Signals system than Category Formation Radar.

Category Formation Radar proves:

```text
early user pain -> product opportunity
```

Market Signal Radar proves:

```text
money-backed expectation -> public-market response -> missing validation
```

Together, they show that Signals can handle both:

```text
bottom-up internet demand
top-down market repricing
```

The market-focused slice is compelling because it connects:

- prediction-market probability
- public-market price action
- event/narrative detection
- source enablement recommendations
- explainable uncertainty

The product story:

```text
Signals detects when money starts moving around an event, company, sector, or narrative, then shows whether public markets confirm it and what evidence is still missing.
```

## Sources Checked

- Polymarket API overview: https://docs.polymarket.com/api-reference
- Polymarket market data overview: https://docs.polymarket.com/market-data/overview
- Polymarket rate limits: https://docs.polymarket.com/api-reference/rate-limits
- Polymarket CLOB/orderbook documentation: https://docs.polymarket.com/trading/orderbook
- Polymarket WebSocket overview: https://docs.polymarket.com/market-data/websocket/overview
- Alpha Vantage API documentation: https://www.alphavantage.co/documentation/
- Polygon stock aggregates documentation: https://polygon.io/docs/rest/stocks/aggregates/custom-bars
- Polygon full market snapshot documentation: https://polygon.io/docs/rest/stocks/snapshots/full-market-snapshot
- Nasdaq Data Link getting started: https://docs.data.nasdaq.com/docs/getting-started
- SEC EDGAR API documentation: https://www.sec.gov/edgar/sec-api-documentation
- Federal Reserve / FRED API update note: https://www.federalreserve.gov/data/data-download-fred-information.htm

## Signature

Signed:

```text
Codex, OpenAI
Engineering research and architecture assistant
```

Timestamp:

```text
2026-04-19 08:50:06 EDT
```
