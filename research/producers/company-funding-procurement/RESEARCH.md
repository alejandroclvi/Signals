# Company, Funding, And Procurement Producer Research

Last checked: 2026-04-18

## Signal Role

Company, funding, and procurement sources are economic commitment signals. They show when organizations allocate capital, report activity, create partnerships, receive contracts, or formalize spending.

## Programmatic Access Specs

Official/public access paths:

- SEC EDGAR developer resources: https://www.sec.gov/about/developer-resources
- SEC accessing EDGAR data: https://www.sec.gov/os/accessing-edgar-data
- USAspending API: https://api.usaspending.gov/
- USAspending endpoints: https://api.usaspending.gov/docs/endpoints
- SAM.gov Entity Management API: https://open.gsa.gov/api/entity-api/
- SAM.gov Opportunity Management API: https://open.gsa.gov/api/opportunities-api/
- SAM.gov rate limits: https://api.sam.gov/docs/rate-limits/
- Crunchbase API access: https://support.crunchbase.com/hc/en-us/articles/32294934314515-How-Can-I-Access-the-API
- Crunchbase API FAQ: https://support.crunchbase.com/hc/en-us/articles/32319290128019-Crunchbase-API-FAQ

SEC EDGAR:

- Free public filings data.
- Current fair-access max request rate: 10 requests/second.
- Efficient scripting and descriptive user agent are expected.

USAspending:

- Public API for U.S. government spending data.
- V2 API.
- Endpoints generally do not require authorization.

SAM.gov:

- APIs for entity, exclusions, responsibility/qualification, and opportunity data.
- Data.gov API key rate limit observed in docs: 1,000 requests/hour.

Crunchbase:

- API is commercial/custom priced.
- FAQ states rate limits of 200 calls/minute.
- Requires sales/contact and appropriate package.

## Limitations

- These are mostly lagging indicators.
- Mapping filings/contracts/funding to a topic requires entity resolution and taxonomy work.
- SEC filings are dense and require extraction.
- USAspending and SAM.gov are U.S. public-sector oriented.
- Crunchbase is paid and licensed.

## Blockers

- Low blocker for SEC and USAspending data.
- Medium blocker for SAM.gov because API key/setup and public-sector specificity matter.
- High commercial blocker for Crunchbase.
- High semantic blocker: turning economic records into topic-level signals requires good entity/topic matching.

## Recommended Approach

Use in Phase 3 as validation, not discovery.

Recommended use cases:

- "companies are mentioning this term in filings"
- "federal opportunities/contracts include this capability"
- "funding activity is rising around this category"
- "new vendors are forming around this topic"

Start with SEC and USAspending because they are official and public.

## Source Links

- https://www.sec.gov/about/developer-resources
- https://www.sec.gov/os/accessing-edgar-data
- https://api.usaspending.gov/
- https://api.usaspending.gov/docs/endpoints
- https://open.gsa.gov/api/entity-api/
- https://open.gsa.gov/api/opportunities-api/
- https://api.sam.gov/docs/rate-limits/
- https://support.crunchbase.com/hc/en-us/articles/32294934314515-How-Can-I-Access-the-API
- https://support.crunchbase.com/hc/en-us/articles/32319290128019-Crunchbase-API-FAQ

