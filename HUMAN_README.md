# Signals — for humans

A founder/operator's guide. Plain English. Every command in this file is real and runs as-written.

## What Signals does

Signals watches the public internet and tells you **what is changing** about the topics you care about — not what is loudest. It catches early shifts in how real people talk, search, and behave, then explains *why* and *what to do next*.

It is **not** a social listening dashboard. It does not count mentions. It looks for *behavior changes*: people starting to ask for the same thing, switching tools, hiring for a new role, raising the same complaint across communities, or quietly shipping code that hints at an upcoming product.

## What problem it solves

Today you find out late. By the time TechCrunch covers an AI shift, three founders already pivoted. By the time a Reddit thread goes viral, the moment to enter the conversation is gone.

Signals is built to surface those moments earlier, in a way you can read and trust:

- **Earlier**: it watches small, specific places (subreddits, GitHub repos, prediction markets, hiring posts) before they become news.
- **Trustable**: every claim is backed by clickable evidence. You can read the original post, comment, or quote.
- **Actionable**: every signal tells you what to do next — watch, save, share, ignore — and explains why.

## The words you'll meet

| Word | What it means |
|---|---|
| **Topic** | The thing you're watching. ("AI agents replacing SaaS", "Claude Code adoption", "Figma sentiment".) Old name: *context*. |
| **Signal** | A claim that something is changing. ("People are switching from Calendly to Cal.com.") Always backed by evidence. |
| **Observation** | One piece of evidence — a Reddit post, a GitHub PR, a market price move, a hiring post, a news article. Old name: *evidence packet*. |
| **Source kind** | One of seven independent ways to see your topic. *Conversation, Search, Building, Forecasts, Hiring, Markets, Truth.* |
| **Coverage** | How many of those seven source kinds back a signal. The more, the more you can trust it. |
| **Cross-source thesis** | A bigger story stitched together from multiple source kinds. "Conversation + Hiring + Forecasts all say X." Old name: *unified signal*. |
| **Stage** | Where a signal is in its arc: *forming → emerging → fresh → mature → fading → stalled / dormant*. Old name: *lifecycle state*. |
| **Group** | Several signals about the same underlying phenomenon, grouped so you can compare. Old name: *case*. |
| **Goal** | A point of view for ranking signals — for ads, content, product research, etc. Old name: *lens*. |

## The seven source kinds

| Source kind | Reads | Tells you |
|---|---|---|
| **Conversation** | Reddit, HackerNews | What people are *saying*. Pain, comparison, advice. |
| **Search** | Google | What people are *looking for*. Demand. |
| **Building** | GitHub | What people are *making*. Adoption, integration. |
| **Forecasts** | Polymarket | What capital-staked markets are *pricing*. Belief. |
| **Hiring** | HN "Who's hiring" | What companies are *committing budget to*. |
| **Markets** | Yahoo Finance, Stocktwits | How public equities are *moving*. |
| **Truth** | Vendor docs, GitHub releases | What the company itself says it *shipped*. |

When several of these say the same thing, you have **coverage**. That's the corroboration story behind every signal you'll read.

## Setup (do this once)

You need Node 22. Check with `node --version`. If it's not 22, install [nvm](https://github.com/nvm-sh/nvm) and run `nvm use`.

```bash
git clone <repo-url> signals
cd signals
pnpm setup            # install, build the database, load sample data
```

You also need a free [OpenRouter](https://openrouter.ai) API key for the AI features (briefs, classification, cross-source theses).

```bash
cp .env.example .env  # then open .env and paste your key after OPENROUTER_API_KEY=
```

Verify everything is wired:

```bash
pnpm doctor
```

You should see a row of green checks. If anything's red, the message tells you what to fix.

## Start the app

```bash
pnpm demo             # or: pnpm dev
```

Open `http://localhost:3000` in your browser. The terminal will print the URL again if you forget.

> **Port already in use?** Run `PORT=3737 pnpm dev` (or any free port).

## Reading the dashboard

You'll see:

- **Left sidebar.** Pick a *topic* from the dropdown. The seeded examples include "Market signals" and "Claude Code news radar".
- **Top middle.** A **radar** — a bubble chart. Each bubble is a signal. The bigger it is, the more evidence it has. The further right it is, the more momentum it has.
- **Top right.** A **list of signals** for the active topic, ranked. Click any row to open it on the right side.
- **Middle band.** **Sources** — which source kinds the topic is using. You can turn them on/off.
- **Right pane.** The **detail** for the selected signal. This is where you'll spend most of your time.

## Opening a signal

When you click a signal, the right pane fills with:

1. **The title + tags.** A one-line claim.
2. **A momentum line.** "Up 42% vs the 14-day baseline."
3. **A stage badge.** Forming, emerging, fresh, mature, fading, stalled, or dormant. With a one-line reason ("14 packets in 7 days · trend ×2.3").
4. **Cross-source corroboration.** A row of seven chips, one per source kind. Three states:
   - **Green** — directly covered. The number on the chip is the count.
   - **Gold** — covered through a cross-source thesis (your signal participates in a bigger story that pulls from this source kind).
   - **Dashed gray** — *missing*. Hover for a hint about what would fill it.
   - **Red dashed** — missing *and* flagged by a thesis ("no truth-layer evidence — try vendor docs").
5. **Cross-source theses.** Cards showing the bigger stories your signal is part of. Click one to open a drawer with the full thesis, what each source kind says, what's missing, and what to do next.
6. **Why this matters.** A one-paragraph explanation in plain language.
7. **Representative evidence.** A scrollable thread view. Click any post or comment to open a side drawer showing the surrounding thread, the AI's key insight, and which other signals cite the same packet.
8. **Intelligence chain.** A trace of how the AI built its understanding: raw observations → LLM extractions → cross-thread patterns → cross-community patterns → conclusions. Click any claim to drill down to its source.

Every claim in the right pane is clickable. You can always answer "why does the system think this?"

## Reading a cross-source thesis

A thesis pulls multiple source kinds together. The header tells you:

- **Stage:** 🌱 EARLY · 🔥 CURRENT · 🌒 LATE
- **Corroboration score (0..1):** how strongly the sources agree.
- **First detected / Peak.** Time signature.

What follows:

- **Thesis.** Two or three sentences integrating the layers.
- **What each source kind says.** A short paragraph per source kind, with the evidence behind it.
- **Missing evidence.** Concrete gaps the AI noticed.
- **Recommended actions.** Two to four watch-tasks.
- **Linked signals.** Every signal that participates in this thesis — click to jump.

The thesis lives both in the dashboard and as a markdown file at `output/unified-<topic>-<date>.md`. You can share that file with anyone.

## What early / current / late means

| Stage | What it means | What to do |
|---|---|---|
| **🌱 Early** | Small, recent, growing — first ripples. | Watch closely. Take notes. Don't act yet. |
| **🔥 Current** | Real momentum across multiple source kinds. | This is the moment. Save the signal, write about it, ship a response. |
| **🌒 Late** | The story has peaked. Coverage exists across the board. | Probably not differentiated to act on directly. Useful for context and counter-positioning. |

For *signal stage* (not thesis stage), the words are different — *forming → emerging → fresh → mature → fading → stalled → dormant* — but the spirit is the same.

## What to do with an insight

Every signal has three actions in the detail pane:

- **Save** — adds to your watchlist (left sidebar → Watchlist). Saving also records an AI "conclusion" so the trace knows you confirmed it.
- **Dismiss** — hides it. Records the dismissal in the trace too.
- **Alert** — flags it for follow-up. (Notifications still come through the dashboard's toast strip, not via email yet.)

Sharing a signal:

- Copy the URL — it deep-links to the signal.
- Or copy the cross-source thesis markdown file from `output/`.

## Refreshing a topic

To pull new data and re-run the analysis for a topic:

```bash
pnpm refresh <topic-id>
```

`<topic-id>` is the slug shown in the URL (e.g. `claude-code-news-radar`). This one command will:

1. Search for new evidence across every enabled source.
2. Link new evidence to existing signals.
3. Re-score everything.
4. Update the cross-source theses.
5. Refresh the dashboard automatically.

For one-off pieces (just a brief, just a Reddit pull, etc.) see the advanced commands at the bottom.

## Common errors and fixes

| Error | What it means | Fix |
|---|---|---|
| `⚠ OPENROUTER_API_KEY not set` in startup | LLM features will fail. | Paste your key into `.env` and restart. |
| `EADDRINUSE :::3000` | Port 3000 is in use. | `PORT=3737 pnpm dev` |
| `Error: SQLITE_ERROR: no such table` | The database wasn't migrated. | `pnpm migrate` |
| Dashboard loads but is empty | No seeded data, no topics. | `pnpm seed:all` |
| `Failed to generate context` after submitting the New Topic modal | OpenRouter rejected the call. | Check the server log; usually it's a missing API key or rate limit. |
| Browser shows "Cannot GET /" | The server isn't running or you opened the wrong port. | Re-run `pnpm dev` and check the URL the terminal prints. |
| "Analysis failed" toast in the dashboard | Thread intelligence couldn't run. | Almost always missing `OPENROUTER_API_KEY`. |
| `unified signals not found` for a topic | Cross-source theses haven't been generated yet for this topic. | `pnpm flow run unify-signals --context <topic-id>` |
| The compare drawer for a group says "no linked signals yet" | The group exists but membership is empty. | `pnpm refresh <topic-id>` — the refresh path rebuilds groups. |

## Walkthrough: query → signal → evidence → insight

You're a solo founder watching the "AI agents replacing SaaS" theme. You want a fresh read.

```bash
# 1. Make sure the topic exists. (One of the seeded examples; if you have it, skip.)
#    Otherwise create one with two clicks: sidebar → "+" → type the topic.

# 2. Refresh — pull new data, re-link, re-score, re-unify.
pnpm refresh ai-agents-replacing-saas-founders-and-te

# 3. Open the dashboard, pick the topic from the sidebar.
#    The radar shows the topic's signals. The biggest, rightmost bubble is
#    where momentum is highest right now.

# 4. Click that bubble. The right pane fills.
#    - The stage badge says "fresh" — meaning recent, growing.
#    - The cross-source strip shows: Conversation 15, Forecasts 10, others empty.
#    - That's a 2-of-7 coverage story. Solid for an early read, not yet
#      decisive. The missing chips tell you what would tighten it.

# 5. Click the "Cross-source theses" card. A drawer opens with:
#    - The thesis (two sentences).
#    - What Conversation said: "Founders quietly dropping SaaS subscriptions
#      for AI tools that automate the same workflow."
#    - What Forecasts priced in: "Polymarket gives 62% to >5% YoY decline
#      in SaaS new logos."
#    - Missing evidence: "No GitHub-side adoption traces yet."
#    - Recommended actions: "Watch r/SaaS for cancellation complaints,
#      monitor github topic 'agent-orchestration'."

# 6. Click any quoted post in "Representative evidence" — a side drawer
#    opens with the full thread. Read the AI's key insight at the top.

# 7. If you agree the signal is real, click "Save". It goes to your
#    watchlist for later.

# 8. To share, copy the URL or open the markdown file:
ls output/unified-ai-agents-replacing-saas-founders-and-te-*.md
```

That's the loop. Query a topic, look at the radar, click the brightest signal, follow the evidence, decide what to do.

## Advanced commands (when you outgrow the happy path)

You usually won't need these. They're documented for completeness.

```bash
pnpm flow run unify-signals --context <topic>     # cross-source theses only
pnpm brief --context <topic>                      # research brief (markdown)
pnpm research <topic>                             # 3-round adaptive research
pnpm thread-intel --context <topic>               # re-analyze top threads with LLM
pnpm reclassify <topic>                           # re-classify all packets
pnpm theme-labels <topic>                         # regenerate theme labels
pnpm graph:sync                                   # mirror data to Neo4j (optional)
pnpm flow run weekly-cadence --context <topic>    # the full weekly pipeline
pnpm test:smoke                                   # data health check
```

## When to ask the system vs ask a human

Use Signals when you want to know:
- "Is something starting to happen in <space>?"
- "What language do people use about this problem?"
- "Is this Reddit thread a one-off or part of a pattern?"
- "Is the market betting on this differently than people are talking about it?"
- "Where are the gaps in what I know?"

Ask a human when you want to know:
- "Should I bet the company on this?" — Signals shows momentum, not strategy.
- "What does this person specifically mean?" — read the source, talk to them.

That's it. Open the dashboard. Click a signal. Follow the evidence.
