# Financial Market Data Producer Research

Last checked: 2026-04-18

## Signal Role

Financial market data is a capital-market response source. It helps Signals understand whether public markets are repricing companies, sectors, ETFs, or baskets related to an internet signal.

This source should not be interpreted as direct causality. It should answer:

```text
Are public markets reacting to something related to this signal?
```

It is most useful for public-company, sector, macro, investor, regulatory, and narrative signals.

## Producer Classification

Producer type:

```text
financial_market_data
capital_market_response
```

Source layer:

```text
capital market response
```

Best for:

- public-company signals
- sector narratives
- ETF and basket movement
- event impact measurement
- investor-facing signals
- macro themes
- competitor sympathy moves
- contradiction checks when social hype is not priced by markets

Weak for:

- private companies
- niche B2B pain
- broad consumer chatter with no public-market mapping
- early product discovery before public-market relevance
- signals where ticker/entity mapping is ambiguous

## Programmatic Access Specs

Potential official/commercial access paths:

- Alpha Vantage API documentation: https://www.alphavantage.co/documentation/
- Polygon/Massive stock aggregates API: https://polygon.io/docs/rest/stocks/aggregates/custom-bars
- Polygon/Massive full market snapshot API: https://polygon.io/docs/rest/stocks/snapshots/full-market-snapshot
- Polygon/Massive ticker reference API: https://polygon.io/docs/rest/stocks/tickers/all-tickers
- Nasdaq Data Link docs: https://docs.data.nasdaq.com/docs/getting-started
- Nasdaq Data Link data organization and authentication: https://docs.data.nasdaq.com/docs/data-organization
- Twelve Data docs: https://twelvedata.com/docs/websocket/ws-real-time-price
- Finnhub quote API docs: https://finnhub.io/docs/api/quote

Useful data:

- daily OHLCV
- intraday OHLCV
- adjusted prices
- volume
- market snapshots
- ticker reference data
- indices
- ETFs
- sector benchmarks
- corporate actions
- market calendars
- real-time or delayed bars
- WebSocket bars for watched tickers/baskets
- options data later

Access model:

- Most professional market-data sources require API keys.
- Real-time exchange data is usually licensed and more expensive than delayed or end-of-day data.
- Delayed and end-of-day data are enough for the first strategic version of Signals.
- Trading workflows should remain out of scope unless the product explicitly becomes a trading tool.

## Recommended V0 Features

```text
return_1d
return_5d
return_20d
abnormal_return_vs_index
abnormal_return_vs_sector
relative_volume
volume_spike_score
realized_volatility_delta
gap_up_or_down
drawdown
basket_breadth
competitor_sympathy_move
sector_rotation_score
market_reaction_label
```

Market reaction labels:

```text
market_confirms
market_ignores
market_contradicts
market_unclear
market_not_mapped
```

## Required Mapping Layer

Stock prices are only useful when the system can map topics to public-market instruments.

Required mappings:

```text
topic -> company
company -> ticker
company -> sector
topic -> theme basket
ticker -> benchmark
ticker -> competitors
ticker -> ETFs
```

Example:

```text
Topic:
AI infrastructure demand

Tickers:
NVDA, AMD, AVGO, ARM, TSM, VRT, ETN

Benchmarks:
SPY, QQQ, SOXX, SMH

Checks:
- basket return vs SPY
- basket return vs SOXX
- breadth of move
- volume spike
- volatility spike
- competitor sympathy
```

## Corroboration Guidance

Increase confidence when:

- related stock or basket return is abnormal after controlling for the benchmark
- volume is above baseline
- realized volatility rises with the signal window
- multiple related tickers move together
- sector-relative performance aligns with the signal
- market movement aligns with news/search/social/primary evidence

Decrease or constrain confidence when:

- the stock move is fully explained by broad market movement
- only one ticker moves and the basket does not
- earnings, macro, or analyst events explain the move better
- internet attention spikes but related assets do not move
- entity/ticker mapping is weak
- the data is delayed but the signal requires intraday precision

## Limitations

- Stock prices are noisy and multi-causal.
- Public-market reaction does not prove internet-signal causality.
- Delayed data may miss intraday timing.
- Real-time data can require exchange licenses and paid plans.
- Ticker mapping can be wrong for ambiguous topics.
- Sector ETFs may be too broad for niche themes.
- Price-only data is weaker than price plus volume, volatility, news, and benchmark controls.

## Blockers

- Licensing and redistribution rules for market data.
- Real-time data costs.
- Entity-to-ticker mapping quality.
- Need for benchmark normalization.
- Corporate actions and adjusted-vs-raw price handling.
- Risk of building a trading product unintentionally.

## Recommended Approach

Use financial market data in Phase 2 or Phase 3 depending on user context.

Recommended V0:

1. Start with daily and delayed intraday OHLCV.
2. Add ticker reference data.
3. Add benchmark ETFs and indices.
4. Build theme baskets manually for watched topics.
5. Compute abnormal return, relative volume, and basket breadth.
6. Display market response as corroboration, not causality.

Recommended V1:

1. Add real-time snapshots for watched tickers only.
2. Add WebSocket streams for high-priority baskets.
3. Add market calendars and session-aware timelines.
4. Add options data only for investor-focused use cases.

## Dashboard Treatment

Stock prices should appear as a node labeled:

```text
Capital Market Response
```

The dashboard should show:

- enabled/disabled state
- covered tickers and baskets
- delayed vs real-time status
- data contribution
- missing capabilities if disabled
- current market reaction label
- abnormal return vs benchmark
- volume and volatility response

## Source Links

- https://www.alphavantage.co/documentation/
- https://polygon.io/docs/rest/stocks/aggregates/custom-bars
- https://polygon.io/docs/rest/stocks/snapshots/full-market-snapshot
- https://polygon.io/docs/rest/stocks/tickers/all-tickers
- https://docs.data.nasdaq.com/docs/getting-started
- https://docs.data.nasdaq.com/docs/data-organization
- https://twelvedata.com/docs/websocket/ws-real-time-price
- https://finnhub.io/docs/api/quote

