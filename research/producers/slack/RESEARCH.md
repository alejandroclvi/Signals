# Slack Producer Research

Last checked: 2026-04-18

## Signal Role

Slack is a private work/community signal source. It can capture customer support friction, internal product discussion, community questions, and B2B workflow pain when the workspace owner opts in.

## Programmatic Access Specs

Official access paths:

- Slack Web API rate limits: https://docs.slack.dev/apis/web-api/rate-limits/
- `conversations.history`: https://docs.slack.dev/reference/methods/conversations.history
- Rate limit changes for non-Marketplace apps: https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/
- Slack API Terms: https://slack.com/terms-of-service/api

Access model:

- Slack app installed into a workspace.
- OAuth scopes for channel history, events, and metadata.
- Events API for real-time ingestion.
- Web API for backfill and lookup.

Rate limits:

- Web API limits apply per method, per app, per workspace, usually per minute.
- Tier 1: 1+ per minute.
- Tier 2: 20+ per minute.
- Tier 3: 50+ per minute.
- Tier 4: 100+ per minute.
- Events API: 30,000 deliveries per workspace per app per 60 minutes.
- Slack returns HTTP 429 with `Retry-After`.

Important 2025 change:

- New commercially distributed non-Marketplace apps have much lower `conversations.history` and `conversations.replies` limits: 1 request/minute and max/default 15 objects.
- Marketplace-approved apps and internal customer-built apps can retain higher limits.

## Limitations

- No global public Slack data.
- Data is workspace-scoped and permissioned.
- Background data collection or scraping unrelated to user queries is restricted for certain Slack data access APIs.
- Commercial distribution outside the Slack Marketplace is now materially constrained for history/replies methods.

## Blockers

- Customer authorization is required.
- Marketplace review may be necessary for a commercially distributed app with useful history limits.
- Long-term storage and indexing of another organization's data may be restricted depending on API/product.

## Recommended Approach

Use Slack only as a customer-opt-in connector.

For MVP:

- do not include Slack as a public producer
- prototype only with owned/internal workspace
- design a Slack Marketplace path if this becomes a paid feature

## Source Links

- https://docs.slack.dev/apis/web-api/rate-limits/
- https://docs.slack.dev/reference/methods/conversations.history
- https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/
- https://slack.com/terms-of-service/api

