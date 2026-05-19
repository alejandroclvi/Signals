# Signals

An early-warning system for detecting internet momentum. Watches what real people say, search, build, and bet on across independent sources, then turns those into clickable claims backed by evidence.

Not social listening. Not a trending-keywords dashboard. Behavior changes, not mention counts.

## Two doors

- **[HUMAN_README.md](./HUMAN_README.md)** — for non-technical founders/operators. Plain English. Three commands to get running.
- **[AGENT_README.md](./AGENT_README.md)** — for coding/research agents. Tables, conventions, where to add things, how not to break it.

## Three commands

```bash
pnpm setup            # install, build the database, seed sample data
cp .env.example .env  # then paste your OPENROUTER_API_KEY
pnpm demo             # starts the server, prints the URL
```

Open the printed URL. Pick a topic from the sidebar. Click a signal.

## Other docs (when you need them)

- [PROJECT_BRIEF.md](./PROJECT_BRIEF.md) — long-form product thesis (~650 lines)
- [docs/UNIFIED_DATA_FLOW.md](./docs/UNIFIED_DATA_FLOW.md) — how the cross-source thesis (unified signals) pipeline works
- [SIGNAL_AGENT_MVP_REPORT.md](./SIGNAL_AGENT_MVP_REPORT.md) / [SIGNAL_AGENT_MVP_PATCH_PLAN.md](./SIGNAL_AGENT_MVP_PATCH_PLAN.md) — drilldown architecture audit + plan
- [FLOW_SIMPLIFICATION_REPORT.md](./FLOW_SIMPLIFICATION_REPORT.md) / [FLOW_SIMPLIFICATION_PATCH_PLAN.md](./FLOW_SIMPLIFICATION_PATCH_PLAN.md) — UX simplification audit + plan
- [CLAUDE.md](./CLAUDE.md) — Claude Code workspace instructions
- [SOURCE_INTELLIGENCE.md](./SOURCE_INTELLIGENCE.md) — multi-platform interpretation framework

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to set up a dev environment, run the test suite, and what we expect in a PR.

## License

[MIT](./LICENSE) © 2026 Manuel Alejandro Calviño Laguardia
