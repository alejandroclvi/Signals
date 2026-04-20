# Stack Exchange Producer Research

Last checked: 2026-04-18

## Signal Role

Stack Exchange, especially Stack Overflow, is an implementation-friction and developer-intent source. It is useful when users are actively trying to solve technical problems.

## Programmatic Access Specs

Official access paths:

- Stack Exchange API docs: https://api.stackexchange.com/docs
- Throttles: https://api.stackexchange.com/docs/throttle
- Filters: https://api.stackexchange.com/docs/filters

Useful data:

- questions
- answers
- comments
- tags
- creation and activity dates
- scores
- accepted answers
- views
- excerpts

Access model:

- API key recommended.
- OAuth access token required for some user/authenticated routes.

Rate limits:

- Default quota: 10,000 requests/day.
- More than 30 requests/second from one IP can trigger harsh throttling.
- Backoff field may appear per method and must be obeyed.
- Identical semantic requests should not be made more than once per minute because of caching.

## Limitations

- Daily quota must be managed across all watched topics.
- Body fields and custom filters require deliberate configuration.
- Stack Overflow is developer-biased and not useful for most non-technical consumer markets.
- Accepted answers and scores may lag question creation.

## Blockers

- Low blocker for developer-market signals.
- Need backoff handling and source-specific caching.

## Recommended Approach

Use Stack Exchange in Phase 1 for developer-focused contexts.

Recommended ingestion:

- query watched tags and exact phrases
- track question creation velocity
- extract error messages and integration requests
- treat repeated unsolved questions as strong friction evidence

## Source Links

- https://api.stackexchange.com/docs
- https://api.stackexchange.com/docs/throttle
- https://api.stackexchange.com/docs/filters

