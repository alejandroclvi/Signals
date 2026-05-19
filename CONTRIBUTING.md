# Contributing to Signals

Thanks for the interest. Signals is an early-warning system for detecting internet momentum — a focused tool, not a general-purpose social-listening platform. Read [README.md](./README.md) first and [AGENT_README.md](./AGENT_README.md) before writing code.

## Before you start

If your change is more than a typo or a small bug fix, **open an issue first** to discuss the approach. We'd rather talk through the design than ask you to rework a finished PR.

Some things we say no to up front, to save everyone time:

- **Generic social-listening features** (word clouds, sentiment dashboards, influencer rankings). Signals ranks by *behavior change*, not popularity.
- **Black-box scoring.** Every score must decompose into named, inspectable components.
- **Volume-only signals.** Ten posts in one subreddit is not a signal. One Reddit thread + a rising search + a GitHub PR is.
- **Blending discovery and corroboration.** They are separate steps for a reason.

The full set of non-negotiables lives in `AGENT_README.md`.

## Dev setup

```bash
git clone <your-fork-url> signals
cd signals
nvm use                  # Node 22
pnpm setup               # install deps, build DB, seed sample data
cp .env.example .env     # paste your OPENROUTER_API_KEY
pnpm doctor              # verify everything is wired
pnpm dev                 # start the dev server on :3000
```

Only `OPENROUTER_API_KEY` is required. Everything else in `.env.example` is optional.

## Running checks

```bash
pnpm test:smoke          # 44-check health pass (DB, evidence, signals, relevance)
```

There is no unit-test or lint suite yet. `test:smoke` is the contract — your change must keep all 44 checks green. If you add a new invariant, add a check.

## How we work

- **Small PRs.** One concern per PR. If you have to write "and also" in the description, split it.
- **Evidence-first.** If you're touching the pipeline, include a before/after of `pnpm test:smoke` and any relevant numbers (signals before/after, evidence counts, etc.).
- **Don't add a flag.** If you need a feature flag to merge, the change isn't ready. Land it behind a real boundary, not a config toggle.
- **No black-box dependencies.** New scoring or ranking logic must be explainable. Adding an LLM call is fine; hiding the prompt or the output structure is not.
- **Conventional-ish commits.** First line ≤ 72 chars, imperative ("Add X", not "Added X"). Body explains *why*, not *what*.

## Where things go

| You want to... | Look at |
|---|---|
| Add a new data source (producer) | `src/pipeline/producers/` + `src/pipeline/producers/registry.mjs` |
| Change how signals are scored | `src/pipeline/refresh-signals.mjs`, `src/pipeline/signal-cases.mjs` |
| Add a new dashboard surface | `src/views/`, `src/routes/pages.mjs`, `src/public/` |
| Add an API endpoint | `src/routes/api.mjs` |
| Add a CLI script | `scripts/`, then wire it in `package.json` |
| Add a flow (multi-step orchestration) | `flows/` + steps in `src/flows/steps/` |
| Change the DB schema | `src/db/migrate.mjs` — write a migration, don't edit existing ones |

If you're not sure where something belongs, ask in the issue.

## Reporting bugs

Open an issue with:

1. What you ran (exact command).
2. What you expected.
3. What happened (paste the error, not a screenshot of it).
4. Output of `pnpm doctor` if the system seems broken at startup.
5. Your Node version and OS.

## Reporting security issues

**Do not open a public issue for security bugs.** Email the maintainer directly. The repo has no production deployment — the most common security concern here is accidental leakage through evidence/output (e.g. a producer dumping API keys into a record). If you spot something like that, please flag it privately first.

## License

By contributing, you agree your contribution will be licensed under the [MIT License](./LICENSE).
