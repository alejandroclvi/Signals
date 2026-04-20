# Product Hunt Producer Research

Last checked: 2026-04-18

## Signal Role

Product Hunt is a launch and maker-attention source. It is useful for new-product discovery, maker narratives, early adopter comments, product categories, and launch velocity.

## Programmatic Access Specs

Official access paths:

- Product Hunt API documentation: https://api.producthunt.com/v2/docs
- Rate limits: https://api.producthunt.com/v2/docs/rate_limits/headers

Access model:

- API v2 uses GraphQL for core API access.
- OAuth credentials are required.

Useful data:

- posts/products
- makers
- comments
- votes
- topics/categories
- launch dates
- product URLs

Rate limits:

- GraphQL endpoint: 6,250 complexity points per 15 minutes.
- Other `/v2/*` endpoints: 450 requests per 15 minutes.
- Responses include rate limit headers:
  - `X-Rate-Limit-Limit`
  - `X-Rate-Limit-Remaining`
  - `X-Rate-Limit-Reset`

## Limitations

- GraphQL query complexity must be managed.
- Product Hunt is launch-weighted; attention may not imply durable adoption.
- Votes can be coordinated by launch campaigns.
- Useful signal is often in comments and category movement, not raw vote totals.

## Blockers

- Low technical blocker.
- Need careful interpretation to avoid confusing launch promotion with market momentum.

## Recommended Approach

Use Product Hunt in Phase 1 or Phase 2.

Recommended ingestion:

- ingest daily launches by topic/category
- fetch comments for products matching watched topics
- monitor repeat maker/category activity
- compare launch attention against later GitHub, Reddit, Search, and review evidence

## Source Links

- https://api.producthunt.com/v2/docs
- https://api.producthunt.com/v2/docs/rate_limits/headers

