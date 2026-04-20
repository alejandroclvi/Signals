# G2 Producer Research

Last checked: 2026-04-18

## Signal Role

G2 is a B2B buyer-intent and review source. It is valuable for economic validation, category comparison, buyer research behavior, and commercial pain.

## Programmatic Access Specs

Official access paths:

- G2 API docs: https://data.g2.com/api/docs
- Buyer Intent data reference: https://documentation.g2.com/docs/buyer-intent-data-reference

Access model:

- API authentication token required.
- Endpoint access depends on account permissions.
- Some data requires paid G2 products or account executive enablement.

Useful data:

- buyer intent events
- profile visits
- category visits
- comparison activity
- sponsored content views
- review and product data, depending on endpoint access

Rate limits:

- Global G2 API rate limit: 100 requests/second.
- Exceeding the limit blocks access for 60 seconds.
- Pagination uses `page[size]` and `page[number]`.
- Default page size is 10.
- Maximum page size is usually 100, with some endpoint-specific lower limits.

## Limitations

- Not a free public data source.
- Access depends on commercial account permissions.
- Buyer Intent data is tied to products/categories available to the account.
- Some event stream endpoints expose only recent windows, such as last 24 hours for certain event streams.

## Blockers

- Contract and account permissions are the main blockers.
- G2 is likely a later-stage validation source, not an MVP source.
- Need legal/commercial review before building around it.

## Recommended Approach

Use G2 as a later partner-gated economic-validation producer.

Best product use:

- "economic evidence appeared"
- "buyer intent is rising"
- "category comparison behavior increased"

Do not make G2 necessary for initial signal detection.

## Source Links

- https://data.g2.com/api/docs
- https://documentation.g2.com/docs/buyer-intent-data-reference

