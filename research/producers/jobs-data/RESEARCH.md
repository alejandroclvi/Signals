# Jobs Data Producer Research

Last checked: 2026-04-18

## Signal Role

Job postings are organizational commitment signals. They show hiring, budget allocation, operationalization, and institutional adoption.

## Programmatic Access Specs

Official access paths and relevant sources:

- Indeed Partner Docs: https://docs.indeed.com/
- LinkedIn API Terms: https://www.linkedin.com/legal/l/api-terms-of-use
- LinkedIn API documentation/help: https://www.linkedin.com/help/linkedin/answer/a526157

Potential source types:

- job board partner APIs
- direct employer career pages
- ATS APIs or structured career pages
- public company job RSS feeds where available
- government job/procurement datasets for public-sector hiring

Indeed access:

- Official docs focus on partner integrations to manage job postings, employers, candidates, Apply, and disposition data.
- Broad public job search/feed access is not clearly exposed as a general self-serve API in the current partner docs.

LinkedIn Jobs:

- LinkedIn broadly restricts scraping and non-official content access.
- Jobs data access is partner/vetted, not a general public-monitoring API.

## Limitations

- Job data is heavily licensed and platform-controlled.
- Broad job-board scraping is a high-risk path.
- Job postings are lagging indicators compared with community demand.
- Keyword stuffing can create false positives.
- Job descriptions can be templated, stale, or reposted.

## Blockers

- High blocker for broad commercial job-board monitoring.
- Need partner agreements or licensed data providers for robust coverage.
- Direct employer career pages may have heterogeneous formats and robots/terms constraints.

## Recommended Approach

Do not make jobs data a Phase 1 source.

Later options:

- licensed job-posting data provider
- direct ATS integrations for opted-in customers
- company career pages only where permitted
- public sector job datasets where terms allow

Use job signals as economic validation, not initial discovery.

## Source Links

- https://docs.indeed.com/
- https://www.linkedin.com/legal/l/api-terms-of-use
- https://www.linkedin.com/help/linkedin/answer/a526157

