# YouTube Producer Research

Last checked: 2026-04-18

## Signal Role

YouTube is an education, explanation, review, and tutorial source. It is useful when people need deeper understanding, when creators review tools, or when users ask practical questions in comments.

## Programmatic Access Specs

Official access paths:

- YouTube Data API: https://developers.google.com/youtube/v3
- Quota calculator: https://developers.google.com/youtube/v3/determine_quota_cost
- Search list endpoint: https://developers.google.com/youtube/v3/docs/search/list
- CommentThreads list endpoint: https://developers.google.com/youtube/v3/docs/commentThreads/list
- Developer policies: https://developers.google.com/youtube/terms/developer-policies

Useful data:

- video search results
- channels
- video metadata
- comments and comment threads
- playlists
- public statistics

Quota:

- Default quota allocation is 10,000 units/day per project.
- `search.list` costs 100 units per request.
- `commentThreads.list` costs 1 unit per request.
- Every API request costs at least 1 unit, including invalid requests.

## Limitations

- YouTube search is quota-expensive: default quota allows roughly 100 search requests/day before other calls.
- Each page of paginated results incurs additional cost.
- Some data requires user authorization.
- Non-authorized API Data storage is restricted. For example, some non-authorized statistics cannot be stored for more than 30 days.
- API clients must follow YouTube developer policies around privacy, display, refresh, and data deletion.
- The API is not a transcript firehose. Captions/transcripts have separate access constraints.

## Blockers

- Quota expansion may require compliance/audit review.
- Broad monitoring across many topics or channels is costly under default quota.
- Storage and refresh policies add compliance work.

## Recommended Approach

Use YouTube in Phase 2.

Recommended ingestion:

- use search sparingly for candidate discovery
- then track selected channels/videos/comments cheaply
- cache search result IDs, not repeated broad searches
- use comments for evidence only on selected videos
- build quota budgeting into the connector

## Source Links

- https://developers.google.com/youtube/v3
- https://developers.google.com/youtube/v3/determine_quota_cost
- https://developers.google.com/youtube/v3/docs/search/list
- https://developers.google.com/youtube/v3/docs/commentThreads/list
- https://developers.google.com/youtube/terms/developer-policies

