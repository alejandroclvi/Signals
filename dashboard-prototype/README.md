# Signal Radar Dashboard Prototype

Generated: 2026-04-19 15:16:44 EDT

This folder contains the first local frontend prototype for the Signals proof of concept.

## Entry Point

Open:

```text
dashboard-prototype/index.html
```

The file is static HTML/CSS/JavaScript and does not require a dev server.

## Current Slice

```text
Reddit Category Pain Radar
```

The prototype shows a founder/product-discovery workflow:

```text
Reddit conversation evidence
-> repeated pain/category signal
-> evidence detail
-> source drilldown or replay indicator
-> score component breakdown
-> missing validation
-> recommended next source
```

## System Principle

```text
Every signal must be inspectable down to the source item or replay reference that produced it.
```

## Current Interaction Model

The dashboard now includes a local source-node control plane:

```text
source nodes
-> evidence coverage ladder
-> ranked next-source recommendations
-> local enable/disable toggles
```

Initial enabled node:

```text
Reddit
```

Available or gated nodes shown in the prototype include Google Search, Google Trends, Hacker News, GitHub, LinkedIn, G2 / Jobs, Polymarket, stock prices, and primary sources.

## Replay Fixtures

Fixture scenarios are loaded from:

```text
dashboard-prototype/fixtures/reddit-category-pain-radar.fixture.js
```

Fixture shape notes live at:

```text
dashboard-prototype/fixtures/README.md
```

This uses a plain script file instead of `fetch()` so the prototype still works when opened directly through `file://`.

Current fixture choices:

- Law firms replay
- Founder AI tools replay

The fixture selector in the top bar changes the active context, metrics, signals, evidence, source nodes, and recommendations.

Current implementation detail:

```text
The external replay fixture uses normalized Reddit-style evidence packets, and signals reference those packet IDs.
```

Replay packets intentionally use `url: "#"` unless they come from an actual captured Reddit item. This avoids presenting synthetic replay data as live source data.

## Live Reddit Pull

The repo now includes an optional real-source pull script:

```text
node dashboard-prototype/tools/pull-reddit-search.mjs
```

Default config:

```text
dashboard-prototype/fixtures/reddit-live-search.config.json
```

Default output:

```text
dashboard-prototype/fixtures/reddit-live-search.fixture.js
```

The script pulls Reddit search results, normalizes them into evidence packets, and writes a dashboard fixture. It needs network access and should be treated as a local development tool, not a production connector.

Live evidence rows expose `source` links when a canonical URL exists. Replay-only rows show `replay` instead of a fake link.

## UI Reference

The visual direction comes from the local PDF:

```text
Signals · Radar.pdf
```

## Current Limitations

- The live Reddit pull currently captures search-result posts, not comments.
- Comment-level source drilldown is tracked separately in Linear as `AGE-201`.
- The stable law-firm scenario is still inline fallback data.
- Charts are custom SVG/HTML, not a charting library.
- Full browser verification through Playwright is currently blocked by missing local CLI package and npm registry access from the sandbox.

## Verification

Completed:

```text
node -e "extract script from dashboard-prototype/index.html" | node --check
node --check dashboard-prototype/fixtures/reddit-category-pain-radar.fixture.js
node --check dashboard-prototype/fixtures/reddit-live-search.fixture.js
node --check dashboard-prototype/tools/pull-reddit-search.mjs
```

Completed runtime smoke check with a local DOM stub, including switching to the external founder replay fixture and the live Reddit search fixture.
