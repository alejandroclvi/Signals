# Producer Matrix

Last checked: 2026-04-18

| Producer | Signal role | Official access path | Viability | Main blocker | Suggested phase |
|---|---|---|---|---|---|
| Reddit | Pain, demand, comparison, early adoption | Reddit Data API / OAuth | Good MVP fit, with commercial caveats | Commercial use may need agreement; policy restrictions on User Content | Phase 1 |
| Hacker News | Technical validation, early adopter debate | Official Firebase API | Good MVP fit | No official search, one-item fetch pattern, limited metadata | Phase 1 |
| GitHub | Implementation behavior, ecosystem growth | REST API, GraphQL API, webhooks | Good MVP fit | Search caps, secondary rate limits, noisy star metrics | Phase 1 |
| Stack Exchange | Developer questions and implementation friction | Stack Exchange API | Good MVP fit | Daily quota and backoff handling | Phase 1 |
| Product Hunt | Launch and maker attention | Product Hunt API v2 | Good MVP fit | GraphQL complexity budget and OAuth setup | Phase 1 or 2 |
| Polymarket | Money-backed expectation and event probability | Gamma API, Data API, CLOB public market data, WebSocket | Good MVP fit for event signals | Only works where active markets exist; liquidity, spread, and wording must be checked | Phase 2 |
| Financial market data | Capital-market response and public-market validation | Alpha Vantage, Polygon/Massive, Nasdaq Data Link, Twelve Data, Finnhub, exchange data vendors | Usable with constraints | Real-time licensing, benchmark normalization, entity-to-ticker mapping, causality risk | Phase 2/3 |
| Google Search | Active intent, source discovery | Custom Search JSON API | Usable with constraints | 10k/day cap and cost; not a true demand volume feed | Phase 2 |
| Google Trends | Search momentum | Google Trends API alpha | Research/alpha gated | Limited alpha access | Strategic application |
| YouTube | Long-form education, reviews, comments | YouTube Data API | Usable with constraints | Search quota is expensive; data retention/compliance rules | Phase 2 |
| npm / PyPI | Developer adoption | Registry APIs, PyPI BigQuery datasets | Good MVP fit | Download interpretation, rate/cost discipline | Phase 2 |
| X/Twitter | Narrative amplification and public conversation | X API pay-per-use or Enterprise | Usable with cost constraints | Cost, firehose requires Enterprise, compliance overhead | Phase 2/3 |
| LinkedIn | Professional normalization and B2B validation | LinkedIn APIs, mostly vetted | High blocker | No broad public feed; scraping prohibited; vetted API access | Later/partner |
| TikTok | Consumer culture and short-form momentum | Display API, Research API, Commercial Content API | Research/partner gated | Commercial broad monitoring not generally available | Later/partner |
| Meta Instagram/Facebook/Threads | Consumer and social graph signals | Meta Graph APIs | High blocker | App review, permissions, limited public discovery | Later/partner |
| Discord | Private community signal | Bot/gateway in opted-in servers | Usable only with consent | No arbitrary server monitoring; message content intent | Customer-led |
| Slack | Private work/community signal | Slack app + OAuth + Events/Web API | Usable only with consent | No global public data; stricter history limits for commercial apps | Customer-led |
| Telegram | Public channels and bot interactions | Bot API, MTProto APIs | Usable with constraints | Bot visibility, history access, no general public search | Phase 3 |
| Apple App Store / Google Play | Owned-product reviews | App Store Connect API, Google Play Developer API | Narrow fit | Official APIs mostly expose only your apps | Later |
| G2 | Buyer intent and B2B review evidence | G2 API | Partner-gated | Paid account permissions and endpoint access | Later/partner |
| Jobs data | Organizational commitment | Partner APIs, direct ATS sources, job boards | High blocker | Broad job-board data is restricted/licensed | Later/partner |
| Company/funding/procurement | Economic commitment | SEC EDGAR, USAspending, SAM.gov, Crunchbase | Mixed | Some public, some paid/custom, mapping to signals is harder | Phase 3 |

## Integration Priorities

The first production architecture should support low-friction producers first:

```text
Reddit -> HN -> GitHub -> Stack Exchange -> Product Hunt
```

Then add intent and education sources:

```text
Polymarket -> financial market data -> Google Search/Trends -> YouTube -> package registries
```

Then add high-cost or gated validation:

```text
X -> G2 -> jobs -> company/funding/procurement
```

Private/community producers should be customer-opt-in, not centrally scraped:

```text
Discord -> Slack -> Telegram
```

High-blocker public social producers should not be core dependencies until access is secured:

```text
LinkedIn -> TikTok -> Meta surfaces
```
