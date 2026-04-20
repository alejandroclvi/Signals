# Reddit Producer Research

Last checked: 2026-04-18

## Signal Role

Reddit is a primary origin and validation source for Signals. It is strong for pain, demand, comparison, frustration, workarounds, and early adoption language.

## Programmatic Access Specs

Official access paths:

- Reddit API documentation: https://www.reddit.com/dev/api/
- Reddit Data API Terms: https://redditinc.com/policies/data-api-terms
- Reddit Developer Platform docs: https://developers.reddit.com/docs/capabilities/server/reddit-api

Relevant data:

- subreddit posts
- comments
- authors and public profile context
- scores and comment counts
- timestamps
- flairs
- listing pagination through `after`, `before`, `limit`, and `count`
- subreddit-level listings and search endpoints

Authentication:

- OAuth credentials are expected for durable API access.
- Devvit apps use a different model where Devvit handles authentication for apps installed in Reddit contexts.

## Limitations

- Reddit states it may set and enforce limits on API use at its discretion.
- The old public API docs exist, but commercial usage is constrained by Data API Terms.
- Reddit User Content is owned by users, not Reddit, and the Data API Terms restrict modification and secondary use.
- Using Reddit content to train machine learning or AI models requires permission from rightsholders unless otherwise permitted.
- Commercial use, research beyond rate limits, or non-expressly permitted use may require a separate agreement with Reddit.
- Devvit app limits are designed for apps running in Reddit, not necessarily external analytics ingestion.

## Blockers

- Commercial product usage is the main blocker.
- Historical backfill at scale may require a separate agreement.
- Deleted, removed, private, quarantined, or moderator-filtered content may not be available or should not be retained.
- Source content compliance and takedown handling must be designed before production.

## Recommended Approach

Use Reddit as the Phase 1 anchor, but keep scope narrow:

- start with explicitly configured subreddits
- use OAuth
- cache only what is needed for evidence and metrics
- store source URLs and native IDs
- implement deletion/removal handling
- avoid model-training use of raw Reddit content without clear rights
- plan for Reddit commercial access discussions before paid launch

## Source Links

- https://www.reddit.com/dev/api/
- https://redditinc.com/policies/data-api-terms
- https://developers.reddit.com/docs/capabilities/server/reddit-api

