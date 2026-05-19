# Runbook: Harvest Reddit signals for the Claude Code Token Bible

## Why default `hook-radar` often returns zero for r/ClaudeCode

The flow `flows/hook-radar.mjs` calls `discover-broad-hooks.mjs`, which filters titles with:

- minimum length (default **28** characters)
- minimum **4** words

Many high-signal Claude Code threads use shorter titles (for example “Community Feedback”, “`/context` annoyance”), so they never enter the classifier.

## Option A — Official flow (stricter titles)

From repo root:

```bash
cd ~/Documents/Signals
pnpm flow run hook-radar \
  --subs "ClaudeCode,ClaudeAI" \
  --sinceDays 14 \
  --minTitleLen 12 \
  --max 20 \
  --minScore 50 \
  --includeHN false
```

Output: `output/hook-backlog/<date>-broad-hooks.md`

The report line **`Titles collected`** counts raw Reddit/HN titles after the length filter; **`HTTP queries`** counts fetches. Lower `--minScore` if the OpenRouter classifier is too strict.

## Option B — Raw engagement pull (one-off script)

Use when you want CSV-style dumps or extra fields without the classifier. Prefer **Option A with `--minTitleLen 12`** first.

```bash
cd ~/Documents/Signals
node --input-type=module <<'NODE'
import discover from "./src/flows/steps/discover-broad-hooks.mjs";

const r = await discover({
  subs: "ClaudeCode,ClaudeAI",
  sinceDays: 45,
  topPerSub: 45,
  hotPerSub: 30,
  minTitleLen: 12,
  includeHN: false,
});

console.log("total_hooks", r.hooks.length);
for (const h of r.hooks.slice(0, 80)) {
  console.log(`${h.community}\t${h.upvotes}↑\t${h.title}\t${h.url}`);
}
NODE
```

Pipe to a file and cluster titles by theme (commands, `CLAUDE.md`, cost, workflows, security, local LLMs, limits).

## Option C — LinkedIn engagement radar (different signal)

Requires LinkedIn MCP + `OPENROUTER_API_KEY` per `flows/linkedin-engagement-radar.mjs`:

```bash
pnpm flow run linkedin-engagement-radar \
  --criteria "Claude Code token usage context window cost optimization" \
  --noOpenTabs true \
  --max 10
```

## Downstream consumer

Handoff artifact for the handbook repo: `~/Dev/claude-code-token-bible/docs/80-research-signals-gaps.md` (updated when you re-run harvests).
