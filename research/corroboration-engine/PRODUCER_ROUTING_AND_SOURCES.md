# Producer Routing And Source Research

Last checked: 2026-04-18

## Purpose

This document maps producers into the Corroboration Engine. It focuses on where each source fits in validation, what it can prove, and what integration constraints matter for routing.

## Producer Roles In Corroboration

| Producer class | What it corroborates | What it cannot prove alone |
|---|---|---|
| Conversation sources | Pain, attention, language, early community formation | Durable intent or economic commitment |
| Social news | Early expert/technical attention, debate quality, propagation | Broad-market demand |
| Search and trends | Active intent, public curiosity, issue-seeking behavior | Origin or sentiment |
| Web/news indexes | Media pickup, narrative propagation, public web evidence | Independent demand if syndicated |
| Developer platforms | Implementation, adoption, technical friction | Buyer demand outside developer markets |
| Review/app stores | Product experience, user complaints, adoption | Origin or market-wide awareness |
| Jobs/procurement/filings | Organizational commitment and budget | Early momentum |
| Prediction markets | Money-backed belief in defined future outcomes | Product demand or general population sentiment |
| Financial market data | Public-market repricing and sector response | Causality or private-market demand |
| Fact-check/claim sources | Contradiction, debunking, factual dispute context | Market demand |
| Scholarly/open knowledge | Research validation, public-interest baselines | Consumer adoption |

## Recommended V0 Routing Set

Use these producers first because they are practical and cover enough layers:

- Reddit
- Hacker News
- GitHub
- Stack Exchange
- Product Hunt
- Polymarket
- financial market data
- Google Custom Search
- Google Trends, if alpha access is granted
- GDELT DOC 2.0 or equivalent news/web index
- Wikimedia Pageviews
- Google Fact Check Tools API for contentious factual claims

This set gives Signals:

- early discussion
- social-news validation
- developer implementation
- web/search intent
- launch attention
- public-interest baseline
- money-backed expectation
- capital-market response
- contradiction checks

## Source Layer Map

| Source | Layer | Best use in engine | Corroboration weight |
|---|---|---|---|
| Reddit | Conversation/origin | Pain, niche language, emerging topics | High early, medium alone |
| Hacker News | Social news/expert discussion | Technical/business relevance and debate | High for technical topics |
| GitHub | Implementation/adoption | Repos, issues, stars, commits, docs | High when implementation matters |
| Stack Exchange | Implementation friction | Questions, errors, solutions, recurring pain | High for developer friction |
| Product Hunt | Launch attention | New product emergence and maker interest | Medium, stronger with other evidence |
| Polymarket | Money-backed expectation | Implied probability, repricing, conviction, disagreement | High for liquid resolvable event markets |
| Financial market data | Capital-market response | Abnormal return, volume, volatility, basket movement | High for public-company and sector signals, weak for causality |
| Google Custom Search | Active web discovery | New docs, articles, pages, tutorials | Medium, depends on result quality |
| Google Trends | Aggregate intent | Search-interest movement and geography | High for broad intent, weak for niche topics |
| GDELT/news index | Media propagation | Narrative spread and news coverage | Medium, discount syndication |
| Wikimedia Pageviews | Public interest | Public curiosity baseline for notable entities | Medium, entity-dependent |
| Fact Check Tools | Contradiction/debunking | Claim verification and disputed narratives | High negative/contradiction signal |
| OpenAlex/Crossref | Research validation | Scholarly activity, citations, technical topics | Medium to high for science/research |
| SEC EDGAR | Economic/primary source | Public-company filings and disclosures | High but narrow |
| USAspending/SAM.gov | Procurement | Government buying and contract signals | High but lagged/narrow |

## Routing By Signal Type

### Developer / Technical Signal

Route order:

1. Reddit
2. Hacker News
3. Stack Exchange
4. GitHub
5. Google Custom Search
6. npm/PyPI
7. Google Trends, if query has enough public search volume
8. YouTube, for tutorial/review behavior
9. jobs data, for organizational adoption

Confidence should increase when conversation evidence is followed by implementation or troubleshooting evidence.

### Consumer Trend

Route order:

1. Reddit
2. YouTube
3. Google Trends
4. Google Custom Search
5. app stores or review platforms
6. Wikimedia Pageviews, if notable
7. TikTok/Instagram/Threads only when access is legitimate

Confidence should increase when social attention becomes search intent and review/adoption behavior.

### B2B Buying Signal

Route order:

1. Reddit niche communities
2. Hacker News or technical forums, if relevant
3. Google Custom Search
4. G2/review sources
5. jobs data
6. LinkedIn, if partner access exists
7. company/funding/procurement sources

Confidence should increase when people move from discussing pain to buying, hiring, evaluating, or implementing.

### Narrative / Claim Signal

Route order:

1. Reddit
2. X or other real-time social sources, if licensed
3. Polymarket, if the claim maps to a resolvable event market
4. GDELT/news index
5. Google Custom Search
6. Google Trends
7. Wikimedia Pageviews
8. Google Fact Check Tools API
9. official primary sources, if entity-specific

Confidence should not increase just because many articles repeat one originating claim. The duplicate cluster should be visible.

### Event / Prediction Signal

Route order:

1. Polymarket
2. GDELT/news index
3. Google Custom Search
4. Google Trends
5. Reddit
6. X or other real-time social sources, if licensed
7. official primary sources, if entity-specific
8. Fact Check Tools API, if the event includes a factual disputed claim

Confidence should increase when a liquid Polymarket market reprices with rising volume/open interest and the move aligns with independent news, search, social, or primary-source evidence. Confidence should decrease when the market is thin, wording is ambiguous, spread is wide, or movement is concentrated in a small number of holders.

### Public-Market / Stock Signal

Route order:

1. financial market data
2. SEC EDGAR or official primary source
3. GDELT/news index
4. Google Custom Search
5. Google Trends
6. Reddit
7. X or other real-time social sources, if licensed
8. Polymarket, if a related event market exists

Confidence should increase when a related stock, ETF, or basket shows abnormal return, volume, volatility, or sector-relative movement that aligns with independent evidence. Confidence should be constrained when the movement is explained by broad market beta, sector moves, earnings, macro releases, or weak entity-to-ticker mapping.

### Research / Scientific Signal

Route order:

1. Hacker News
2. Reddit
3. Google Custom Search
4. OpenAlex
5. Crossref
6. Semantic Scholar, if added
7. GitHub
8. Wikipedia/Wikidata/Pageviews

Confidence should increase when research publications, implementations, and expert discussion align.

## API And Access Constraints

### Google Trends

Role:

- aggregate search-intent validator
- baseline and seasonality source
- geography/subregion validator

Current constraint:

- Google Trends API is in alpha and requires application/acceptance.
- It provides a rolling five-year window and supports regular interval aggregation and geography according to Google's public alpha documentation.

Integration implication:

- Build a `trends_provider` interface, but keep V0 functional without official Trends access.
- If alpha access is missing, support manual analyst checks or approved third-party alternatives as a temporary, explicitly labeled source.

Source:

- https://developers.google.com/search/apis/trends
- https://developers.google.com/search/blog/2025/07/trends-api

### Polymarket

Role:

- money-backed expectation source
- implied event probability
- conviction, disagreement, and repricing evidence
- resolved-market feedback labels for event signals

Current constraint:

- Polymarket has three relevant public data surfaces: Gamma API for discovery, Data API for trades/open interest/holders/activity, and CLOB public endpoints for prices/order books/spreads/price history.
- Trading endpoints require authentication and should be out of scope unless Signals explicitly builds trading workflows.
- Rate limits are Cloudflare-enforced sliding windows across API groups and endpoints.

Integration implication:

- Use Gamma API for market/event discovery and tag/category filtering.
- Use CLOB public market-data endpoints and WebSockets for watched markets.
- Use Data API for open interest, trades, holders, and activity where relevant.
- Treat Polymarket as a specialized corroboration source, not a general demand source.
- Always score liquidity, spread, book depth, market wording, and holder concentration before trusting a price move.

Source:

- https://docs.polymarket.com/api-reference
- https://docs.polymarket.com/market-data/overview
- https://docs.polymarket.com/trading/orderbook
- https://docs.polymarket.com/market-data/websocket/overview
- https://docs.polymarket.com/quickstart/introduction/rate-limits

### Financial Market Data

Role:

- capital-market response source
- public-company and sector validation
- market-confirmation or market-contradiction evidence

Current constraint:

- Most providers require API keys.
- Real-time exchange data is usually licensed and more expensive than delayed or end-of-day data.
- Useful interpretation requires ticker mapping, benchmark normalization, and event-window controls.

Integration implication:

- Start with daily and delayed intraday OHLCV.
- Use ticker reference data and manually curated baskets for watched themes.
- Compare returns against benchmarks and sector ETFs.
- Treat stock movement as market response, not proof of internet-signal causality.
- Add real-time snapshots and WebSockets only for watched baskets where latency matters.

Source:

- https://www.alphavantage.co/documentation/
- https://polygon.io/docs/rest/stocks/aggregates/custom-bars
- https://polygon.io/docs/rest/stocks/snapshots/full-market-snapshot
- https://docs.data.nasdaq.com/docs/getting-started
- https://twelvedata.com/docs/websocket/ws-real-time-price

### Google Custom Search JSON API

Role:

- web evidence discovery
- docs/tutorial/article discovery
- official page lookup
- contradiction/primary-source lookup

Current constraint:

- Requires a Programmable Search Engine and API key.
- Public docs state 100 free queries/day and paid queries beyond that, with a daily cap.

Integration implication:

- Route sparingly.
- Cache query results.
- Use it for targeted corroboration, not broad crawling.
- Store query strings and result positions because result volatility matters.

Source:

- https://developers.google.com/custom-search/v1/overview

### GDELT DOC 2.0

Role:

- news/media propagation
- web narrative monitoring
- article cluster evidence

Current constraint:

- GDELT DOC 2.0 supports full-text search over a rolling recent coverage window and JSON output.

Integration implication:

- Useful as a low-friction media corroboration layer.
- Must discount syndicated/repeated coverage.
- Treat as media propagation, not demand.

Source:

- https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/amp/

### Wikimedia Pageviews

Role:

- public-interest baseline
- notable-entity attention changes

Current constraint:

- Pageviews measure page requests and separate spider/automated categories in the analytics concepts.

Integration implication:

- Useful when the topic maps cleanly to a Wikipedia page.
- Not useful for new products, ambiguous concepts, or non-notable niche terms.

Source:

- https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/concepts/page-views.html

### Google Fact Check Tools API

Role:

- contradiction and debunking for factual claims
- ClaimReview lookup

Current constraint:

- The Claim Search API can query fact-check results with an API key.
- The API exposes claims search and image search; write operations for ClaimReview markup require authorization.

Integration implication:

- Do not use it for market validation.
- Use it when the candidate contains factual claims, public narratives, disputed claims, health/science claims, political claims, or company rumors.
- A fact-check hit should create a contradiction evidence packet with high visibility.

Source:

- https://developers.google.com/fact-check/tools/api/
- https://developers.google.com/fact-check/tools/api/reference/rest/

### Reddit

Role:

- origin and pain discovery
- community-level language
- qualitative evidence

Current constraint:

- Reddit's help docs say free access rate limits are enforced at 100 queries per minute per OAuth client id and recommend monitoring rate-limit headers.
- Reddit terms include restrictions around storage, deletion handling, commercial use, and ML training from user content.

Integration implication:

- Store only what the policy allows.
- Build deletion and retention handling early.
- Use Reddit as high-value early evidence, but require external corroboration before high confidence.

Source:

- https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
- https://redditinc.com/policies/data-api-terms
- https://www.reddit.com/dev/api/

### Hacker News

Role:

- social-news validation for technical/startup topics
- expert discussion and debate

Current constraint:

- Official HN API exposes public data through Firebase and is read-only.

Integration implication:

- Use as an accessible technical attention source.
- Combine with GitHub/Stack Exchange to distinguish debate from implementation.

Source:

- https://github.com/HackerNews/API

### GitHub

Role:

- implementation and adoption evidence
- issues, repositories, stars, commits, docs

Current constraint:

- GitHub REST API has primary and secondary rate limits.
- Search endpoints have more restrictive limits than core endpoints.

Integration implication:

- GitHub checks should be targeted.
- Store rate-limit status and backoff decisions.
- Prefer specific repository/package/domain queries once aliases are known.

Source:

- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://docs.github.com/rest/reference/rate-limit

### Stack Exchange

Role:

- implementation friction
- recurring questions and error patterns

Current constraint:

- Stack Exchange API applies throttles, including concurrent/IP protections and quota behavior.

Integration implication:

- Excellent corroborator for technical pain.
- Use query batching and avoid aggressive polling.

Source:

- https://api.stackexchange.com/docs/throttle

### Product Hunt

Role:

- product launch validation
- maker/startup attention

Current constraint:

- API v2 is GraphQL and requires access token.
- Product Hunt docs state default non-commercial restrictions unless contacted for commercial use.
- Rate limits include complexity-based quotas for GraphQL and request-based limits for other endpoints.

Integration implication:

- Useful for launches and startup/product categories.
- Treat access/legal review as a blocker for commercial production use.

Source:

- https://api.producthunt.com/v2/docs
- https://api.producthunt.com/v2/docs/rate_limits/headers

### Common Crawl

Role:

- historical web presence
- open web backfill
- broad crawl evidence

Current constraint:

- Common Crawl is a free, open web crawl corpus.
- The URL index is not intended for overload; bulk filtering should use bulk/index data patterns.

Integration implication:

- Do not use for real-time corroboration.
- Use for historical baselines and "did this topic exist before?" checks.

Source:

- https://commoncrawl.org/
- https://index.commoncrawl.org/
- https://commoncrawl.org/cdxj-index

### OpenAlex And Crossref

Role:

- scholarly/research corroboration
- citations and academic topic movement

Current constraint:

- OpenAlex now requires a free API key for normal use and uses credit-based limits.
- Crossref exposes public metadata and recommends using the polite pool with email; rate and concurrency limits vary by pool.

Integration implication:

- Use for scientific, technical, medical, policy, and research-driven signals.
- Route only when the candidate profile indicates scholarly relevance.

Sources:

- https://docs.openalex.org/how-to-use-the-api/api-overview
- https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication
- https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/

### SEC EDGAR

Role:

- public-company primary source
- filings, disclosures, risk factors, business validation

Current constraint:

- SEC public guidance requests efficient scripting, declared user agents, and states a current max request rate for fair access.

Integration implication:

- Use only for company/public-market signals.
- High trust, but narrow and lagged.

Source:

- https://www.sec.gov/os/accessing-edgar-data

### USAspending And SAM.gov

Role:

- procurement and government buying signal

Current constraint:

- USAspending provides public API access to federal spending data.
- SAM.gov/Data.gov web services publish API key rate limits.

Integration implication:

- Strong economic validation for government-facing markets.
- Lagged, narrow, and not useful for broad consumer signals.

Sources:

- https://api.usaspending.gov/
- https://api.usaspending.gov/docs/
- https://api.sam.gov/docs/rate-limits/

## Routing Algorithm

V0 can use rules:

```text
for candidate:
  profile = assign_expected_validation_profile(candidate)
  aliases = expand_aliases(candidate)
  producers = choose_producers(profile, score_stage, budget)

  for producer in producers:
    if producer.available and budget.allows(producer):
      run_targeted_queries(producer, aliases)

  evidence = normalize_results()
  groups = cluster_for_independence(evidence)
  features = compute_features(groups, baselines, profile)
  score = score_features(features)
  write_explanation(score, features, missing_expected_evidence)
```

V1 should add adaptive routing:

- If evidence is ambiguous, query disambiguation sources.
- If evidence is single-source but high velocity, schedule follow-up.
- If evidence is high confidence, query economic sources.
- If contradiction risk is high, query fact-check and primary sources.
- If quota is constrained, query highest expected-value producers first.

## Producer Router Inputs

```text
signal_profile
candidate_stage
current_score
source_layer_coverage
missing_expected_layers
query_budget
producer_availability
producer_rate_limit_state
producer_cost_class
freshness_requirement
retention_constraint
```

## Producer Router Outputs

```text
producer_id
query_bundle
priority
purpose
expected_value
max_cost
retry_policy
freshness_requirement
fallback_producer
```

## Blocking Issues

1. Google Trends official API access is not guaranteed.
2. Product Hunt commercial use requires review/contact.
3. Reddit storage/deletion/retention compliance must be designed before production ingestion.
4. X, LinkedIn, TikTok, Meta, G2, broad jobs feeds, and some review sources are access-gated or commercial.
5. Search APIs can become expensive if used for broad polling.
6. News/web indexes require strong duplicate and syndication handling.
7. Ambiguous topic names can create false corroboration across unrelated contexts.

## Recommendation

Build the Corroboration Engine around a producer router that knows what each source can prove.

Do not ask every producer every question. Ask:

```text
What type of signal is this?
What evidence would we expect if it is real?
Which producers can supply that evidence?
What is the cheapest reliable next check?
What evidence is missing or contradictory?
```
