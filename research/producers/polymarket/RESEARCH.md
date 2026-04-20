# Polymarket Producer Research

Last checked: 2026-04-18

## Signal Role

Polymarket is a money-backed expectation and prediction-market source. It is useful when Signals needs to understand where people are willing to risk capital on a defined future outcome.

It should not be treated as a general social platform or a broad demand source. Its best use is corroborating event probability, market consensus, disagreement, repricing, conviction, and resolution outcomes.

## Producer Classification

Producer type:

```text
prediction_market
money_backed_expectation
```

Source layer:

```text
economic expectation
market consensus
event probability
```

Best for:

- elections
- crypto and macro events
- policy and regulation
- sports outcomes
- geopolitical events
- company/public-market events
- AI milestone markets
- public narratives with clear resolution criteria

Weak for:

- vague trends
- niche B2B pain
- private enterprise adoption
- broad product demand
- topics without active markets
- markets with low liquidity or unclear resolution rules

## Programmatic Access Specs

Official access paths:

- API overview: https://docs.polymarket.com/api-reference
- Market data overview: https://docs.polymarket.com/market-data/overview
- Fetching market data: https://docs.polymarket.com/quickstart/fetching-data
- Events endpoint: https://docs.polymarket.com/api-reference/events/list-events
- Orderbook documentation: https://docs.polymarket.com/trading/orderbook
- WebSocket overview: https://docs.polymarket.com/market-data/websocket/overview
- Rate limits: https://docs.polymarket.com/quickstart/introduction/rate-limits
- Authentication: https://docs.polymarket.com/api-reference/authentication

APIs:

- Gamma API: `https://gamma-api.polymarket.com`
- Data API: `https://data-api.polymarket.com`
- CLOB API: `https://clob.polymarket.com`

Access model:

- Gamma API is public and does not require authentication.
- Data API is public and does not require authentication.
- CLOB read endpoints for order books, prices, midpoints, spreads, and price history are public.
- CLOB trading endpoints require authentication.
- WebSocket market channel is public for market data.
- User WebSocket channel requires authentication.

Useful Gamma API data:

- events
- markets
- tags
- categories
- series
- sports metadata
- public search
- market questions
- descriptions
- resolution sources
- active/closed status
- volume
- liquidity
- open interest
- start/end dates

Useful CLOB data:

- YES/NO token prices
- order books
- best bid/ask
- midpoint
- spread
- price history
- last trade price
- real-time order book updates
- real-time trade events

Useful Data API data:

- trades
- activity
- open interest
- holders
- positions by public wallet
- leaderboards and builder analytics

Rate limits:

- Official docs describe Cloudflare-enforced sliding-window throttling.
- Gamma API includes limits for events, markets, comments, tags, and public search.
- Data API includes limits for trades, positions, closed positions, and health checks.
- CLOB API includes separate limits for market-data endpoints, ledger endpoints, auth endpoints, and trading endpoints.
- WebSockets should be preferred over repeated polling for live price/order-book tracking.

## Signal Features To Derive

Polymarket does not provide a native "curated signals" endpoint. Signals should derive curated signal features from the raw market feeds.

Recommended features:

```text
probability_current
probability_delta_1h
probability_delta_6h
probability_delta_24h
probability_delta_7d
volume_24h
volume_delta
open_interest_current
open_interest_delta
liquidity_current
spread_current
spread_delta
order_book_depth
book_imbalance
trade_count_window
large_trade_count
holder_concentration
days_to_resolution
market_age_days
resolution_source_quality
market_wording_clarity
```

Recommended derived signals:

- probability shock: large implied-probability move in a short window
- money confirms narrative: market reprices in the same direction as social/news momentum
- hype without money: social/news attention rises while market price stays flat
- early money signal: market reprices before Reddit, news, Google Trends, or X movement
- disagreement signal: high volume, volatile price, wide spread, or fast back-and-forth repricing
- conviction signal: price move plus rising open interest and tightening spread
- thin-market warning: large price move with low depth, low liquidity, or wide spread
- resolution pressure: market reprices quickly near end date

## Limitations

- A market price is an implied probability from trading activity, not objective truth.
- Thin markets can move on small trades.
- Liquidity and spread determine how trustworthy a price is.
- Market wording and resolution criteria are central to interpretation.
- Market participants are not representative of the general population.
- Missing markets do not imply missing signals.
- Prediction markets are strongest for clearly resolvable events and weaker for abstract trends.
- Some markets may be driven by a few large actors.
- Polymarket is useful for expectation and conviction, not direct product demand.

## Blockers

- Low technical blocker for public read-only market data.
- Interpretation blocker is meaningful: naive systems will over-trust prices without checking liquidity, spread, and market wording.
- Regulatory/geographic and product-policy considerations should be reviewed before any trading-related feature.
- Trading endpoints should be out of scope unless Signals explicitly builds trading workflows.

## Recommended Approach

Use Polymarket in Phase 2 as a specialized corroboration producer.

Recommended ingestion:

1. Use Gamma API to ingest active events and markets by tag/category.
2. Store market wording, resolution source, dates, tags, volume, liquidity, and open interest.
3. Use CLOB public endpoints for price, spread, midpoint, order book, and price history.
4. Use WebSocket market channel for watched markets that need live monitoring.
5. Use Data API for open interest, trades, holders, and activity where relevant.
6. Derive probability-shock and conviction features.
7. Route into the Corroboration Engine as "money-backed expectation" evidence.

Do not use Polymarket as a global replacement for:

- Reddit conversation
- Google Search/Trends intent
- GitHub implementation
- G2 buyer reviews
- jobs/procurement economic commitment
- primary-source news or filings

## Corroboration Guidance

Increase confidence when:

- probability moves materially
- volume rises
- open interest rises
- spread tightens
- liquidity is sufficient
- market wording is clear
- market resolution source is credible
- Polymarket movement aligns with independent social/news/search evidence

Decrease confidence when:

- spread is wide
- liquidity is shallow
- move is caused by thin book depth
- holder concentration is high
- market wording is ambiguous
- market is close to resolution but evidence is stale
- social/news hype does not move the market
- price movement contradicts higher-quality primary evidence

## Example Signals

```text
High conviction:
AI regulation market moves from 34% to 51% in 24h, volume doubles, open interest rises, and news/legal sources corroborate the trigger.

Weak signal:
Tiny market moves from 20% to 45%, but liquidity is low, spread is 18 points, and one holder owns most of the YES side.

Contradiction:
Social chatter says an outcome is likely, but liquid Polymarket markets remain flat or move in the opposite direction.
```

## Source Links

- https://docs.polymarket.com/api-reference
- https://docs.polymarket.com/market-data/overview
- https://docs.polymarket.com/quickstart/fetching-data
- https://docs.polymarket.com/api-reference/events/list-events
- https://docs.polymarket.com/trading/orderbook
- https://docs.polymarket.com/market-data/websocket/overview
- https://docs.polymarket.com/quickstart/introduction/rate-limits
- https://docs.polymarket.com/api-reference/authentication

