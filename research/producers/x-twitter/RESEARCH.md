# X/Twitter Producer Research

Last checked: 2026-04-18

## Signal Role

X is primarily an amplification and narrative source. It is useful for fast-moving public commentary, experts, founders, investors, memes, backlash, and narrative shifts.

## Programmatic Access Specs

Official access paths:

- X API overview: https://docs.x.com/x-api
- Getting access: https://docs.x.com/x-api/getting-started/getting-access
- Pricing: https://docs.x.com/x-api/getting-started/pricing
- Rate limits: https://docs.x.com/x-api/fundamentals/rate-limits
- Enterprise API: https://docs.x.com/enterprise-api/introduction

Access model:

- Pay-per-use X API for standard access.
- Enterprise API for firehose, volume streams, custom limits, and dedicated support.

Useful endpoints:

- recent post search
- full-archive search
- filtered stream
- post counts
- user lookup
- timelines
- trends
- communities search

Authentication:

- bearer token for read-only public data
- OAuth 2.0 or OAuth 1.0a for user-context actions

## Limitations

- Pay-per-use pricing means cost must be managed at the query and evidence level.
- Current pricing is visible in the developer console rather than fully fixed in static docs.
- Recent search returns up to 100 results per request.
- Full-archive search can return up to 500 results per request but has stricter throughput.
- Filtered stream has rule and connection limits.
- Full firehose access requires Enterprise.
- Enterprise pricing is custom.

## Blockers

- Cost and access tier are the biggest blockers.
- Broad, high-volume monitoring can become expensive quickly.
- Compliance handling for deleted/protected content must be built.
- Firehose-like completeness is not available without Enterprise.

## Recommended Approach

Do not make X a Phase 1 dependency.

Use it later for:

- selected topic amplification tracking
- narrative comparison after signals are found elsewhere
- counts and sample evidence, not exhaustive monitoring

Recommended production pattern:

- query only watched topics
- prefer count endpoints before fetching full post data
- dedupe billable resources within the billing day where supported
- track per-signal cost
- use Enterprise only if X becomes central to customer value

## Source Links

- https://docs.x.com/x-api
- https://docs.x.com/x-api/getting-started/pricing
- https://docs.x.com/x-api/fundamentals/rate-limits
- https://docs.x.com/enterprise-api/introduction

