# GitHub Producer Research

Last checked: 2026-04-18

## Signal Role

GitHub is an implementation and developer adoption source. It shows when people are building, integrating, filing issues, forking, starring, creating examples, and experiencing technical friction.

## Programmatic Access Specs

Official access paths:

- REST API docs: https://docs.github.com/en/rest
- REST API rate limits: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- REST API search: https://docs.github.com/en/rest/search/search
- GraphQL API limits: https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api
- REST API best practices: https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api

Useful data:

- repositories
- stars
- forks
- issues
- pull requests
- discussions where available
- releases
- topics
- README and package metadata
- contributor activity
- webhooks for installed apps

Authentication:

- unauthenticated public API access is possible but limited
- personal access token, OAuth app, or GitHub App for higher limits

## Limitations

- Unauthenticated REST API limit: 60 requests/hour.
- Authenticated user REST API limit: generally 5,000 requests/hour.
- GitHub App installation limits start at 5,000 requests/hour and can scale, with caps.
- Enterprise Cloud org-owned apps can have higher limits.
- Secondary limits include concurrency and per-minute point constraints.
- Search endpoints have tighter limits than normal REST endpoints.
- Search pagination is capped; broad queries should be partitioned by time or qualifier.

## Blockers

- Search caps can hide long-tail results.
- Star counts are weak signals by themselves.
- Secondary limits can block naive crawlers even when primary limits look available.
- Repository metadata is public, but enterprise/private usage is invisible unless connected by the customer.

## Recommended Approach

Use GitHub in Phase 1.

Recommended ingestion:

- use authenticated API calls
- search for repos/issues/discussions around watched topics
- partition broad searches by `created`, `updated`, language, topic, or stars
- use webhooks for customer-owned repos
- prioritize behavior metrics: issues, PRs, release cadence, dependents, examples, integration requests
- avoid treating stars alone as adoption

## Source Links

- https://docs.github.com/en/rest
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://docs.github.com/en/rest/search/search
- https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api

