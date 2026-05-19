# 2026-05-19 — Seed-wipe incident

## What happened

During end-to-end verification of the new `pnpm setup` script (introduced as part of the flow-simplification work — see `FLOW_SIMPLIFICATION_PATCH_PLAN.md`), `setup.mjs` unconditionally invoked `pnpm seed:all`. That fan-out (`scripts/seed-fixtures.mjs` + `scripts/seed-market-fixtures.mjs`) is **destructive** — it deletes from `signal_phrases`, `signal_spread`, `signal_related` across the entire database and then `INSERT OR REPLACE`s the three fixture contexts.

The agent re-ran the new script against the live, populated database to verify it worked.

## Impact

| Table | Before | After |
|---|---:|---:|
| `contexts` | 11 (3 fixture + 8 live) | 3 (fixtures only) |
| `evidence_packets` | 23,061 | 38 |
| `threads` | 1,511 | 0 |
| `thread_intelligence` | 194 | 0 |
| `unified_signals` | 29 | 0 |
| `signal_cases` / `signal_case_members` | 30 / 176 | 0 / 0 |
| `signals` | 378 | 14 |
| `intelligence_units` | 2,180 | 2,210 (survived; +30 from session) |

Saved/dismissed/alerted state on signals: lost.

## What survived on disk

- `data/discovered-*.json` — 8 files, ~1,800 discovered URLs total. Re-ingestable via `pnpm restore`.
- `output/unified-*-2026-05-19.md` — 5 markdown briefs intact.
- `scripts/seed-claude-code-news-radar.mjs`, `seed-research-contexts.mjs`, `seed-discovery-contexts.mjs` — context configs.
- `intelligence_units` rows survived (intelligence units don't cascade from `signals`).

No Time Machine snapshot was reachable at the time of the incident.

## Root cause

`scripts/setup.mjs` (as first shipped) ran `pnpm seed:all` unconditionally. The seed scripts were written assuming a fresh DB and contain wholesale `DELETE FROM signal_phrases`, etc., to keep the fixture state clean.

## Fix shipped same session

`scripts/setup.mjs` now guards the seed step:

```js
if (nonFixture === 0 && totalEvidence < 100) {
  step("Seeding sample data (pnpm seed:all)", "pnpm", ["seed:all"]);
} else {
  console.log("→ Skipping seed: database already has N non-fixture context(s) …");
}
```

`pnpm setup` re-run on a populated DB now prints a clear "skipping seed" message instead of touching data.

A new script `scripts/restore.mjs` (registered as `pnpm restore`) was added to rebuild contexts from the surviving seed scripts and re-ingest from `data/discovered-*.json`. Default invocation is non-LLM (`--steps contexts,ingest`); LLM-driven steps are opt-in (`--steps all` or comma list including `theme,intel,unify`).

## Recovery actions taken

- `pnpm restore --steps contexts,ingest` to rebuild context configs and re-ingest discovered Reddit evidence.
- For `claude-code-news-radar`: full multi-source re-ingest across all 7 layers (`reddit, hackernews, polymarket, github, google, anthropic, hn-hiring, yfinance, stocktwits, reddit-finance`).
- `pnpm flow run weekly-cadence --context claude-code-news-radar` (lifecycle → cast-net → linker → article).
- `pnpm flow run unify-signals --context claude-code-news-radar` for fresh cross-source theses.
- `pnpm test:smoke` to verify.

## Lessons

1. **Never run unverified setup on a live DB.** Verification should always use a throwaway DB path (`SIGNALS_DB=/tmp/test.db pnpm setup`).
2. **Seed scripts should be self-protecting.** A future change should make `scripts/seed-fixtures.mjs` refuse to run when it would delete user data; the fix in `setup.mjs` is one layer, but the seed scripts themselves should also guard.
3. **Add an automated backup before destructive operations.** Consider `pnpm backup` that snapshots `data/signals.db` to `data/backups/signals-<timestamp>.db` before any pipeline that calls a seed or refresh.
4. **The flow-simplification work is otherwise intact** — the four READMEs, the new commands, and the UI copy changes all survive the wipe and apply to any database (seeded or restored).
