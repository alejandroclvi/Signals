# Hacker News Producer Research

Last checked: 2026-04-18

## Signal Role

Hacker News is an early-adopter validation source. It is valuable for technical markets, developer tools, AI infrastructure, open-source projects, technical skepticism, and launch reactions.

## Programmatic Access Specs

Official access path:

- Official Hacker News Firebase API: https://github.com/HackerNews/API

Core endpoints:

- `/v0/item/{id}.json`
- `/v0/user/{id}.json`
- `/v0/topstories.json`
- `/v0/newstories.json`
- `/v0/beststories.json`
- `/v0/askstories.json`
- `/v0/showstories.json`
- `/v0/jobstories.json`
- `/v0/maxitem.json`
- `/v0/updates.json`

Relevant data:

- story title and URL
- story score
- comments and nested comment IDs
- author username
- timestamps
- text for Ask HN, Show HN, and comments
- public user karma and submitted IDs

Authentication:

- No auth required for the public Firebase API.

## Limitations

- No official full-text search endpoint.
- Threads require recursive item fetching.
- The API exposes item IDs and item records; it does not return a full hydrated thread in one request.
- Comment vote counts are not exposed.
- Some deleted/dead items may be missing or return limited fields.
- There is no formal published rate limit in the API README; client discipline is required.

## Blockers

- Low access blocker.
- Main blocker is ingestion efficiency: a popular thread requires many item fetches.
- Search and historical discovery need a separate strategy because the official API is feed/item oriented.

## Recommended Approach

Use HN in Phase 1.

Recommended ingestion:

- poll `newstories`, `topstories`, `askstories`, and `showstories`
- use `updates` for changed items and users
- recursively hydrate selected threads only when they match watched topics
- cache item records by ID
- build our own search index over ingested items

## Source Links

- https://github.com/HackerNews/API

