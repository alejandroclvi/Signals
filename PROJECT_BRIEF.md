# Signals Project Brief

## Core Idea

Signals is a product for detecting early internet momentum around topics, products, markets, behaviors, and narratives that matter to a specific user context.

The product is not a generic social listening dashboard. Its purpose is to help answer:

> What is changing online, why does it matter, and what evidence supports that conclusion?

The first use case is Reddit-based signal discovery: identifying when relevant users start talking about a topic in a way that suggests emerging demand, frustration, adoption, narrative change, coordination, or economic opportunity.

## Definition Of A Signal

A signal is an observable online behavior that may predict something meaningful before it becomes obvious.

Not every mention is a signal. A useful signal usually has several of these properties:

- It is increasing relative to a previous baseline.
- It appears in communities relevant to the user's context.
- It contains specific language about needs, pain, behavior, or intent.
- It comes from people whose identity, history, or context makes the comment meaningful.
- It spreads across communities or platforms.
- It persists over time instead of appearing as a one-off spike.
- It points toward a decision, action, purchase, switch, workflow, or belief change.

In short:

> Strong signal = repeated specific behavior from relevant people across time.

## Why This Matters

Most internet analytics tools over-index on attention:

- mentions
- impressions
- likes
- sentiment
- trending keywords
- influencer posts

Those metrics can be useful, but they often miss the deeper question:

> Are relevant people changing behavior in a way that matters?

Signals should help separate attention from momentum.

Attention means people are talking.

Momentum means more relevant people are changing behavior, language, intent, or decisions in the same direction.

## Initial Source: Reddit

Reddit is a strong starting source because users often describe problems in natural language. They ask for recommendations, complain about tools, compare options, describe workflows, and look for alternatives.

Useful Reddit patterns include:

- "Has anyone else..." posts
- recommendation requests
- comparison threads
- repeated complaints
- alternative-seeking behavior
- posts about switching from one tool to another
- detailed workflow comments
- users mentioning budget or willingness to pay
- the same phrase appearing across multiple communities
- niche subreddit activity before mainstream awareness

Reddit is especially useful for detecting:

- unmet demand
- frustration with incumbents
- early adoption
- emerging community formation
- language customers naturally use
- practical barriers to adoption
- skepticism, backlash, or fatigue

## Signal Dimensions

The system should evaluate signals across several dimensions.

### 1. Volume

How much is the topic being mentioned?

Volume matters, but raw volume is not enough. A large topic may always be noisy. A niche topic with a sudden change may be more valuable.

### 2. Velocity

How quickly is attention increasing?

Examples:

- posts per day or week
- comments per thread
- time to first comment
- growth in unique authors
- growth in relevant subreddits

Velocity is often more important than volume.

### 3. Acceleration

Is the rate of growth itself increasing?

This is where early momentum often appears. A topic going from 3 posts per month to 20 posts per week may be more interesting than a huge topic that is stable.

### 4. Specificity

Are people speaking vaguely, or describing a precise need?

Weak:

> This is cool.

Stronger:

> I need a cheaper alternative to QuickBooks that can automatically categorize receipts.

Specific pain, workflow, comparison, budget, and workaround language should increase signal strength.

### 5. Actor Quality

Who is producing the signal?

Useful actor attributes may include:

- account age
- contribution history
- subreddit-specific credibility
- domain knowledge
- repeated participation in relevant discussions
- evidence of being a buyer, practitioner, operator, or power user
- cross-community activity

A small thread with knowledgeable users can matter more than a viral post with shallow engagement.

### 6. Cross-Community Spread

Is the topic escaping its original community?

A signal becomes more meaningful when it appears across adjacent communities. For example, a topic appearing in `r/freelance`, `r/smallbusiness`, and `r/bookkeeping` is stronger than the same volume contained in only one subreddit.

### 7. Intent

What are users trying to do?

Intent is one of the most important dimensions because it explains the meaning behind the conversation.

Examples:

- "How do I fix this?" = pain
- "What tool should I use?" = buying intent
- "Is anyone else seeing this?" = emerging phenomenon
- "I built a workaround" = unmet need
- "I'm switching from X to Y" = competitive movement
- "Where can I learn this?" = education demand
- "Who else is in?" = coordination behavior

### 8. Durability

Does the signal persist after the initial spike?

A durable signal reappears in different forms over time. The system should distinguish between a temporary viral moment and a repeated pattern.

## Signal Types

The product should classify signals into useful categories.

### Demand Signals

People want something.

Examples:

- "Is there a tool for this?"
- "How do I automate this?"
- "I hate doing this manually."
- "What is the best way to solve this?"

### Frustration Signals

People are unhappy with existing options.

Examples:

- "Why is this so expensive?"
- "I'm done with this product."
- "Every tool in this space is bad."
- "Does anyone have an alternative?"

### Adoption Signals

People are starting to use something.

Examples:

- "I switched to this."
- "Here is my workflow."
- "I use this every day now."
- "How do I integrate this with my stack?"

### Narrative Signals

The way people talk about a topic is changing.

Examples:

- "I thought this was hype, but now I get it."
- "This used to be embarrassing, now everyone is doing it."
- "People in my industry are suddenly talking about this."

### Coordination Signals

People are forming around something.

Examples:

- new communities
- shared documents
- Discord servers
- group calls
- open-source repos
- collective action

### Economic Signals

Money, hiring, purchasing, or monetization appears.

Examples:

- pricing discussions
- willingness to pay
- job posts
- agencies forming
- paid communities
- affiliate activity
- vendor comparisons

### Expectation Signals

People are pricing or betting on a defined future outcome.

Examples:

- prediction-market probability moves
- rising open interest in an event market
- money-backed disagreement around a narrative
- event markets repricing before news or search catches up

These signals are strongest when the market is liquid, the spread is tight, and the event has clear resolution criteria.

### Capital-Market Response Signals

Public markets are repricing companies, sectors, ETFs, or baskets related to the signal.

Examples:

- abnormal stock return versus benchmark
- related ETF or sector basket outperformance
- volume or volatility spike
- competitor sympathy move
- market ignoring or contradicting a popular social narrative

These signals should be interpreted carefully. Stock movement shows market response, not proof that the internet signal caused the move.

### Status Signals

People want to be associated with something.

Examples:

- sharing screenshots
- posting results
- bragging about access
- asking how to get into a trend
- copying the language of early adopters

## Signal Scoring

A simple starting formula:

```text
Signal strength =
  volume change
+ velocity
+ acceleration
+ specificity
+ actor quality
+ cross-community spread
+ intent strength
+ durability
+ expectation or market response, when relevant
- obvious noise or manipulation
```

The product should avoid presenting scores as magic. Every score should be explainable through evidence.

Better user-facing language:

> Mentions are up 3.4x from baseline, mostly from relevant users asking for alternatives.

Worse user-facing language:

> Trend score: 87.

## Product Positioning

Signals should feel less like a social media analytics tool and more like an early-warning system for behavior change.

The product should help users:

- detect emerging momentum
- understand why something is moving
- inspect evidence
- separate noise from durable signals
- save useful examples
- monitor topics over time
- receive alerts when a relevant pattern changes

## Core Interface Concept

The interface should be organized around three layers:

1. Radar view
2. Signal feed
3. Evidence drilldown

### Radar View

The radar is the main overview. It shows topics, products, phrases, or narratives as bubbles.

Suggested axes:

- X-axis: relevance to the user's context
- Y-axis: momentum or acceleration
- bubble size: total volume
- bubble color: signal type
- bubble outline: confidence

The purpose of the radar is to show what is moving and whether it matters.

The most important design rule:

> Rank by change, not raw popularity.

### Signal Feed

The signal feed is a ranked inbox of emerging signals.

Each signal card should answer:

- What is the signal?
- What changed?
- Why might it matter?
- Which communities are involved?
- What type of intent is showing up?
- What evidence supports this?
- Is it new, growing, peaking, stable, or fading?
- What should the user do next?

Example card structure:

```text
AI bookkeeping tools for freelancers

Signal type: Demand + Frustration
Momentum: +240% vs baseline
Confidence: Medium
Stage: Emerging

Why it matters:
Freelancers are asking for cheaper, simpler alternatives to QuickBooks with automation.

Evidence:
18 threads
142 comments
3 communities
6 comparison posts
4 willingness-to-pay mentions

Top communities:
r/freelance, r/smallbusiness, r/bookkeeping

Actions:
Open evidence, save, dismiss, create alert
```

### Evidence Drilldown

The detail page should be evidence-first. Users need to trust why the system flagged something.

Recommended sections:

- momentum timeline
- community heatmap
- intent breakdown
- representative posts and comments
- phrase and narrative clusters
- actor quality view
- related topics
- source links
- saved evidence

## Key Visualizations

### Momentum Timeline

Shows whether the topic is growing, spiking, or fading.

Metrics:

- mentions over time
- unique authors
- comments per post
- upvote/comment ratio
- acceleration
- baseline comparison

### Community Heatmap

Shows whether the signal is spreading.

Example:

```text
                  Week 1   Week 2   Week 3   Week 4
r/freelance          2        5       11       19
r/smallbusiness      1        3        8       14
r/bookkeeping        0        2        7       12
r/tax                0        0        3        5
```

### Intent Breakdown

Shows what users are trying to do.

Example:

```text
Frustration      38%
Tool search      24%
Comparison       17%
Adoption         12%
Education         6%
Speculation       3%
```

### Phrase And Narrative Clusters

Replaces generic word clouds with grouped language patterns.

Example:

```text
Cluster: QuickBooks alternative
- cheaper than QuickBooks
- QuickBooks too complex
- simple bookkeeping app

Cluster: Receipt automation
- scan receipts
- categorize expenses
- auto-match transactions

Cluster: AI bookkeeper
- AI accountant
- automate bookkeeping
- tax prep assistant
```

### Evidence Table

A structured list of source posts and comments.

Suggested fields:

- source
- community
- author
- date
- signal type
- detected intent
- relevance
- summary
- direct excerpt
- link

## MVP Scope

The first version should stay narrow and useful.

### MVP Goal

Help a user monitor a defined context and identify emerging Reddit signals worth reviewing.

### MVP Inputs

- topics to monitor
- relevant subreddits
- keywords and phrases
- competitor names
- negative phrases
- high-intent phrases
- baseline time window

### MVP Outputs

- ranked signal inbox
- signal detail page
- momentum timeline
- community spread view
- representative evidence
- saved evidence library
- basic alerts

### MVP Signal Types

Start with four:

- demand
- frustration
- adoption
- comparison

These are likely the most actionable early categories.

### MVP Scoring

Initial scoring can be transparent and heuristic:

- change from baseline
- number of relevant communities
- presence of high-intent phrases
- number of unique authors
- comment depth
- repeated phrase clusters
- evidence quality

Avoid overbuilding model complexity before the product has real usage data.

## Example Use Case

User context:

> I care about AI tools for small law firms.

Relevant communities:

- `r/LawFirm`
- `r/legaltech`
- `r/solo_practice`
- `r/LawSchool`
- `r/paralegal`

High-intent phrases:

- "alternative to Clio"
- "summarize discovery"
- "AI for legal docs"
- "confidentiality concern"
- "billable hours"
- "client intake automation"
- "would pay for"

Possible signal:

> Solo attorneys are increasingly asking how to use AI to summarize discovery documents while preserving confidentiality.

Why it matters:

> The conversation is moving from curiosity to workflow-specific adoption concerns.

Evidence to show:

- repeated posts from practicing attorneys
- comparison of specific tools
- comments about confidentiality and pricing
- users asking about implementation
- mentions across multiple legal communities

## Daily User Workflow

1. Open the signal inbox.
2. Review newly detected or changed signals.
3. Open the strongest signal cards.
4. Inspect evidence.
5. Save useful posts or dismiss weak signals.
6. Create alerts for patterns worth monitoring.
7. Revisit watchlist topics weekly to evaluate durability.

## Product Principles

### Evidence First

Every interpretation should be backed by visible source material.

### Change Over Popularity

The system should prioritize deltas, acceleration, and emerging behavior over raw volume.

### Context Matters

The same signal can matter in one context and be irrelevant in another. Relevance should be user-defined and adjustable.

### Intent Over Sentiment

Sentiment is less useful than understanding what users are trying to do.

### Human Review Remains Important

The product should help users review evidence faster, not pretend that automated scoring is perfect.

### Language Is An Asset

The exact words users use are valuable. The interface should preserve and organize natural language from real discussions.

## What To Avoid

Avoid building:

- generic word clouds
- raw mention counters as the main metric
- black-box trend scores
- influencer rankings
- sentiment-only dashboards
- dashboards full of disconnected charts
- viral content tracking without behavioral interpretation

The product should not answer only:

> What is popular?

It should answer:

> What is changing, among whom, and what might that change mean?

## Open Questions

- Who is the first target user: founder, investor, marketer, researcher, product team, or operator?
- Should the product begin as a dashboard, a daily report, or an alerting system?
- How much control should users have over the signal scoring model?
- Should the product focus on one source first, or support cross-platform validation early?
- What is the best way to define user context?
- How should the system distinguish organic discussion from spam, promotion, or manipulation?
- What is the smallest useful evidence package for a signal?
- Should users be able to label signals to train future relevance?

## Initial Product Hypothesis

People do not need another dashboard showing what is trending. They need a system that watches the parts of the internet relevant to their context and surfaces early behavior changes with enough evidence to support judgment.

Signals should become that system.
