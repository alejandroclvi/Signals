# Producer Research Workspace

Last checked: 2026-04-18

This workspace maps the programmatic data producers that Signals may connect to. A producer is any platform, API, marketplace, registry, or data provider where internet signals are created, amplified, validated, or economically confirmed.

The purpose of this research is to separate sources that are easy to integrate from sources that are valuable but gated, contract-heavy, or unsuitable for broad monitoring.

## Folder Structure

- `_cross_source/`: decision matrix, sequencing, and architecture guidance.
- `reddit/`: Reddit posts, comments, subreddits, and community conversations.
- `hacker-news/`: Hacker News stories, comments, users, and live item updates.
- `x-twitter/`: X public conversation, search, trends, and streaming.
- `linkedin/`: professional graph, organization/page data, and gated LinkedIn APIs.
- `github/`: repositories, issues, discussions, pull requests, stars, and developer activity.
- `google-search-trends/`: Google Custom Search and Google Trends API alpha.
- `youtube/`: videos, channels, search, and comments through YouTube Data API.
- `tiktok/`: TikTok public/research APIs and commercial content API.
- `meta-instagram-facebook-threads/`: Meta graph surfaces: Instagram, Facebook, Threads.
- `discord/`: Discord bot/gateway data from opted-in servers.
- `slack/`: Slack workspace events/history from installed workspaces.
- `telegram/`: Telegram Bot API and public/channel monitoring constraints.
- `product-hunt/`: Product Hunt launches, comments, votes, and maker activity.
- `polymarket/`: prediction-market prices, order books, trades, open interest, and money-backed expectations.
- `stack-exchange/`: Stack Overflow and Stack Exchange Q&A activity.
- `package-registries-npm-pypi/`: npm and PyPI package metadata/download signals.
- `app-store-google-play-reviews/`: Apple and Google app review APIs.
- `g2/`: G2 review and buyer-intent APIs.
- `jobs-data/`: job posting sources and employment-data constraints.
- `company-funding-procurement/`: SEC EDGAR, USAspending, SAM.gov, Crunchbase.
- `financial-market-data/`: stock prices, ETFs, indices, baskets, and capital-market response.

## Viability Labels

- `Good MVP fit`: useful data, official access, manageable limits.
- `Usable with constraints`: official access exists but scope, cost, or quota limits matter.
- `Partner-gated`: useful only after approval, contract, or marketplace review.
- `Research-gated`: useful primarily for academic/nonprofit research access.
- `High blocker`: broad monitoring is not viable through official APIs.

## Current Read

Best early producers for Signals:

1. Reddit
2. Hacker News
3. GitHub
4. Stack Exchange
5. Product Hunt
6. Polymarket, for money-backed expectation signals when markets exist
7. Google Search / Trends, with Trends alpha access as a strategic application
8. YouTube, with strict quota management
9. Package registries
10. Financial market data, when the user context includes public companies, sectors, macro, or investors

High-value but gated producers:

1. X/Twitter
2. LinkedIn
3. TikTok
4. Meta Instagram/Facebook/Threads
5. Slack
6. Discord
7. G2
8. Jobs data

The product should not depend on high-blocker producers for the first useful version.
