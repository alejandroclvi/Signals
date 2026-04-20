# Telegram Producer Research

Last checked: 2026-04-18

## Signal Role

Telegram is a public-channel and community coordination source. It can show group movement, niche communities, trading/investing chatter, creator communities, and public announcement channels.

## Programmatic Access Specs

Official access paths:

- Telegram Bot API: https://core.telegram.org/bots/api
- Telegram API docs: https://core.telegram.org/api
- Standard bot privacy policy: https://telegram.org/privacy-tpa

Bot API ingestion:

- `getUpdates` long polling
- webhooks through `setWebhook`
- message updates visible to the bot
- channel posts visible when bot is added with appropriate permissions

Key `getUpdates` specs:

- `limit` accepts 1-100 updates.
- `timeout` supports long polling.
- `offset` is used to acknowledge processed updates.
- Webhooks and `getUpdates` are mutually exclusive.
- Updates are not retained indefinitely.

## Limitations

- Bots only receive messages they are allowed to see.
- Public channel monitoring often requires adding the bot or using MTProto-style clients.
- The Bot API is not a global Telegram search API.
- Historical backfill is limited unless the account/bot has access.
- Telegram does not expose simple static rate-limit tables for all methods; clients must handle 429 and retry logic.

## Blockers

- Arbitrary Telegram monitoring is not straightforward through Bot API.
- MTProto client approaches can create account-management and compliance complexity.
- Private groups/channels require explicit access.

## Recommended Approach

Use Telegram later for:

- customer-owned channels
- public channels where access is explicitly granted
- bot-based community ingestion

Avoid making Telegram a core early producer unless the product specifically targets public Telegram channels.

## Source Links

- https://core.telegram.org/bots/api
- https://core.telegram.org/api
- https://telegram.org/privacy-tpa

