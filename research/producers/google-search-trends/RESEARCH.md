# Google Search And Trends Producer Research

Last checked: 2026-04-18

## Signal Role

Google Search and Google Trends are intent and curiosity sources. They help validate whether people are actively looking for solutions, comparisons, alternatives, or explanations.

## Programmatic Access Specs

Official access paths:

- Custom Search JSON API: https://developers.google.com/custom-search/v1/overview
- Custom Search JSON API introduction: https://developers.google.com/custom-search/v1/introduction
- Custom Search JSON API terms: https://developers.google.com/custom-search/terms
- Google Trends API alpha: https://developers.google.com/search/apis/trends
- Google Trends API alpha announcement: https://developers.google.com/search/blog/2025/07/trends-api

Custom Search JSON API:

- Requires a Programmable Search Engine and API key.
- Returns web or image search results in JSON.
- Free quota is 100 queries/day.
- Paid usage is $5 per 1,000 queries, up to 10,000 queries/day.

Google Trends API alpha:

- Limited alpha tester access.
- Rolling 5-year data window.
- Daily, weekly, monthly, and yearly aggregation.
- Region and subregion breakdowns.
- Consistently scaled data across requests.
- Data goes up to about 2 days ago per announcement.

## Limitations

- Custom Search is source discovery, not true search-demand volume.
- Custom Search daily cap is low for broad monitoring.
- Query design matters because each query costs quota.
- Google Trends API is not fully public; alpha acceptance is required.
- Trends data is search interest, not absolute search volume.

## Blockers

- Google Trends alpha access is uncertain.
- Custom Search is expensive and capped if used as broad crawling.
- Trends data may not have enough granularity for tiny niche topics.

## Recommended Approach

Use Custom Search narrowly:

- discover source pages
- validate exact phrase appearance
- monitor "alternative to X", "X vs Y", "how to automate Y" queries through selected search result checks

Apply for Google Trends API alpha because it is strategically aligned with Signals.

Do not depend on Trends alpha for MVP until access is approved.

## Source Links

- https://developers.google.com/custom-search/v1/overview
- https://developers.google.com/custom-search/v1/introduction
- https://developers.google.com/custom-search/terms
- https://developers.google.com/search/apis/trends
- https://developers.google.com/search/blog/2025/07/trends-api

