# Package Registries Producer Research

Last checked: 2026-04-18

## Signal Role

Package registries are implementation and adoption sources. They show what developers publish, install, depend on, and integrate.

## Programmatic Access Specs

Official access paths:

- npm Registry API: https://api-docs.npmjs.com/
- npm search docs: https://docs.npmjs.com/cli/v11/commands/npm-search
- PyPI APIs and datasets: https://docs.pypi.org/api/
- PyPI BigQuery datasets: https://docs.pypi.org/api/bigquery/

npm useful data:

- package metadata
- versions
- maintainers
- dependencies
- dist-tags
- publish times
- search results

PyPI useful data:

- JSON API package metadata
- project metadata
- release files
- RSS feeds
- BigQuery download statistics table: `bigquery-public-data.pypi.file_downloads`
- BigQuery metadata table: `bigquery-public-data.pypi.distribution_metadata`

## Limitations

- npm registry docs do not provide one simple public signal-specific analytics API.
- npm download data exists through separate endpoints/ecosystem tooling, but should be verified before relying on it.
- PyPI says its JSON, RSS, and Index APIs are CDN cached and currently have no edge rate limit, but irresponsible activity can be prohibited.
- PyPI advises a unique `User-Agent` and avoiding thousands of requests in minutes.
- PyPI BigQuery usage may create Google Cloud costs.

## Blockers

- Low blocker for metadata.
- Medium blocker for reliable adoption metrics because downloads are noisy:
  - CI installs
  - mirrors
  - dependency installs
  - bot traffic
  - lockfile churn

## Recommended Approach

Use package registries in Phase 2 for developer-market signals.

Recommended metrics:

- new packages matching topic
- release cadence
- dependency relationships
- download velocity, with caveats
- package naming clusters
- maintainer ecosystem overlap

Do not treat downloads as direct active users.

## Source Links

- https://api-docs.npmjs.com/
- https://docs.npmjs.com/cli/v11/commands/npm-search
- https://docs.pypi.org/api/
- https://docs.pypi.org/api/bigquery/

