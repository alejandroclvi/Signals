# Implementation Report: Category Formation Radar V0

Generated: 2026-04-18 22:13:58 EDT

Prepared for: Signals

Prepared by: Codex, OpenAI

Status: MVP implementation direction

## Executive Summary

The first product slice for Signals should be:

```text
Category Formation Radar V0
```

The goal is to detect early AI product-category formation from repeated user pain, tool requests, workaround language, and emerging category language.

This direction is based on the selected interests:

- consumer trends spreading across social platforms
- new product categories emerging
- founder / marketer / researcher / analyst use cases
- product opportunity discovery
- repeated complaints and detailed user pain
- AI tools as the first domain
- Reddit, Hacker News, GitHub, Google Search, Google Trends, and LinkedIn as important sources
- very early signals with optional corroboration
- ranked feed, evidence detail, and what-to-enable-next control panel

The first implementation should not start with every source. It should start with the smallest loop that proves the core product:

```text
Reddit
-> normalized evidence packets
-> repeated pain/request detection
-> candidate product-category grouping
-> ranked emerging categories
-> evidence detail
-> missing validation
-> what-to-enable-next recommendation
```

The first user-visible promise:

```text
Show me emerging AI product opportunities before they become obvious.
```

## Product Slice Name

```text
Category Formation Radar V0
```

## Primary Product Question

```text
What AI product category is forming from repeated user pain before it becomes obvious?
```

## Target User

Primary:

```text
Founder
```

Secondary:

```text
Growth researcher
Product strategist
Marketer
Research analyst
VC / startup scout
```

## Primary Job To Be Done

```text
Find early product opportunities from repeated complaints, emerging language, and cross-source validation.
```

The user wants to know:

- What problem keeps appearing?
- Who is complaining?
- What words do they use?
- Is this a real category forming or a one-off spike?
- What source should be enabled next to validate the opportunity?
- What product could be built from this signal?

## MVP Definition

The MVP is:

```text
Detect early AI product-category formation from repeated pain and show what evidence supports it.
```

The MVP is not:

```text
A generic social listening feed.
A full multi-platform monitoring system.
A stock or prediction-market product.
A black-box AI trend detector.
```

## First Implementation Slice

The first actual feature slice:

```text
Reddit Category Pain Loop V0
```

It should detect:

- repeated complaints
- AI tool requests
- comparison posts
- workaround language
- early category language
- switching behavior
- manual workflow pain
- "is there a tool for..." language
- "I wish there was..." language
- "I hacked together..." language

## Source Strategy

### Source Sequence

Recommended source order:

```text
1. Reddit
2. Hacker News
3. Google Search
4. GitHub
5. Google Trends, when access exists
6. LinkedIn later
```

### Why Reddit First

Reddit is the best first source for this slice because it reveals:

- natural language pain
- repeated complaints
- requests for recommendations
- user frustration
- workaround behavior
- category language before the category is named
- cross-community recurrence

### Why Hacker News Second

HN helps validate whether the topic has technical/startup relevance.

It contributes:

- expert debate
- builder/startup attention
- technical skepticism
- early product/startup framing

### Why Google Search Third

Google Search validates intent and landscape.

It contributes:

- active discovery
- tutorial/doc/blog emergence
- existing solution discovery
- comparison pages
- official source lookup

### Why GitHub Fourth

GitHub is useful when the candidate category has a developer/build angle.

It contributes:

- implementation behavior
- open-source prototypes
- integration activity
- developer adoption

### Why Google Trends Later

Google Trends is useful for broader validation, but:

- the official API is alpha/gated
- early signals may be too small to register
- broad search trend data can lag initial category formation

### Why LinkedIn Later

LinkedIn is useful for professional normalization and B2B category formation, but:

- broad public monitoring is access-constrained
- official APIs are not designed as a general public feed
- it should not be an MVP dependency

## Initial Reddit Scope

Start with subreddits where product pain and AI-tool requests naturally appear.

Recommended initial set:

```text
r/Entrepreneur
r/smallbusiness
r/freelance
r/productivity
r/marketing
r/sales
r/consulting
r/startups
r/SaaS
r/artificial
r/ChatGPT
r/ArtificialInteligence
```

Add vertical-specific subreddits later after the category detector works.

## What Counts As A Category Formation Signal

### Repeated Pain

Examples:

```text
I keep wasting time doing X.
This manual process is killing me.
I hate doing this every week.
```

### Tool Request

Examples:

```text
Is there an AI tool that can do X?
What is the best AI tool for X?
Does anyone know a tool that automates this?
```

### Workflow Workaround

Examples:

```text
I hacked together ChatGPT + Zapier + Sheets to do X.
I use three tools to get this done.
Here is my manual workaround.
```

### Emerging Category Language

Examples:

```text
AI assistant for X
AI agent for Y
Copilot for Z
AI workflow for X
```

### Switching Behavior

Examples:

```text
I stopped using X and now use AI for this.
I replaced my old workflow with ChatGPT.
I am moving from tool A to tool B.
```

### Comparison Behavior

Examples:

```text
What is the best AI tool for X?
Tool A vs Tool B for this workflow?
Is there a cheaper alternative?
```

### Frustration With Existing AI Tools

Examples:

```text
Every AI tool for this is bad.
These tools are too generic.
None of them handle my workflow.
```

## Scoring Model V0

Rank emerging categories by:

```text
pain_specificity
repeat_frequency
cross_community_spread
recommendation_request_language
workaround_language
ai_substitution_potential
buyer_or_user_relevance
novel_category_language
source_quality
freshness
```

Subtract for:

```text
generic_ai_hype
one_off_virality
low_specificity_posts
spam_or_affiliate_patterns
already_saturated_categories
ambiguous_topic_mapping
```

### Suggested Formula

```text
category_formation_score =
  pain_specificity
  + repeat_frequency
  + cross_community_spread
  + request_intent
  + workaround_intensity
  + ai_substitution_fit
  + category_language_novelty
  + user_relevance
  + freshness
  - hype_penalty
  - spam_penalty
  - saturation_penalty
  - ambiguity_penalty
```

### Confidence Bands

```text
low:
interesting phrase or isolated complaint

watch:
repeated complaint or request in one community

medium:
repeated pain across communities with specific workflow language

high:
cross-community pain plus HN/Search/GitHub corroboration
```

The MVP should expect most early signals to be `watch` or `medium`.

## Data Model Additions

### `category_candidates`

Represents a possible product category forming.

```text
id
category_label
description
domain
status
first_seen_at
last_seen_at
score
confidence_band
origin_evidence_id
created_at
updated_at
```

### `category_evidence`

Links evidence packets to category candidates.

```text
category_id
evidence_id
match_reason
match_confidence
pattern_type
created_at
```

Pattern types:

```text
repeated_pain
tool_request
workflow_workaround
category_language
switching_behavior
comparison_behavior
existing_tool_frustration
```

### `category_aliases`

Tracks language variants for a forming category.

```text
id
category_id
alias_text
alias_type
source
confidence
is_active
created_at
updated_at
```

Alias types:

```text
phrase
workflow
job_to_be_done
tool_name
competitor
category_name
negative_filter
```

### `category_scores`

Stores score components.

```text
id
category_id
score_version
score
confidence_band
pain_specificity
repeat_frequency
cross_community_spread
request_intent
workaround_intensity
ai_substitution_fit
category_language_novelty
user_relevance
freshness
hype_penalty
spam_penalty
saturation_penalty
ambiguity_penalty
created_at
```

## Pipeline Design

### Step 1: Ingest Reddit

Inputs:

- selected subreddit list
- search queries
- time window
- API credentials

Outputs:

- raw payload pointer
- normalized evidence packets
- source health and checkpoint state

### Step 2: Normalize Evidence

Convert Reddit posts/comments into evidence packets:

```text
producer_id = reddit
source_layer = conversation
native_id
native_url
subreddit
author metadata, where allowed
created_at_source
observed_at
title
text_excerpt
metrics
query_used
permission_scope
retention_policy
```

### Step 3: Detect Category Patterns

Detect pattern types:

- repeated pain
- tool request
- workflow workaround
- category language
- switching behavior
- comparison behavior
- existing tool frustration

Start with deterministic phrase and regex rules. Add embeddings later.

### Step 4: Group Into Candidate Categories

Group evidence by:

- similar pain phrase
- workflow described
- job-to-be-done
- AI substitution phrase
- target user context
- subreddit/community overlap
- semantic similarity later

### Step 5: Score Category Candidates

Compute:

- score
- confidence band
- evidence count
- community count
- pattern mix
- freshness
- hype/spam penalties
- missing validation

### Step 6: Recommend Next Source

Use the Source Enablement Recommender.

Examples:

```text
If category has repeated Reddit pain but no intent:
Recommend Google Search.

If category has technical/build angle:
Recommend GitHub.

If category has startup/technical debate potential:
Recommend Hacker News.

If category appears B2B/professional:
Recommend LinkedIn later, but mark gated.

If broad enough:
Recommend Google Trends, but mark access-gated/possibly too early.
```

### Step 7: Display In Dashboard

The first dashboard should show:

1. Ranked Emerging Categories
2. Signal Detail With Evidence
3. What To Enable Next

## Dashboard Requirements

### Ranked Emerging Categories

Show:

```text
category label
score
confidence band
top pain phrase
communities
evidence count
freshness
missing validation
next source recommendation
```

Example rows:

```text
AI client follow-up automation
AI spreadsheet cleanup agents
AI sales call summarizers for freelancers
AI compliance document reviewer
AI real-estate listing assistant
AI recruiting screener for small teams
```

### Category Detail Page

Show:

```text
why this matters
what users are complaining about
evidence snippets
source communities
pattern breakdown
score components
missing validation
what to enable next
```

### What To Enable Next

Examples:

```text
Enable Google Search:
Adds active intent and existing-solution discovery.

Enable Hacker News:
Adds technical/startup validation.

Enable GitHub:
Adds implementation behavior if builders are creating tools.

Enable Google Trends:
Adds broader search validation, but may be too early and access-gated.

Enable LinkedIn:
Adds professional normalization, but access is gated.
```

## Example End-To-End Signal

### Candidate

```text
AI client follow-up automation
```

### Evidence

```text
Reddit:
Freelancers and consultants repeatedly describe wasting time turning meeting notes into follow-up emails, proposals, and next-step summaries.

Pattern:
repeated pain + tool request + workflow workaround

Communities:
r/freelance
r/consulting
r/smallbusiness
r/sales
```

### Interpretation

```text
A product category may be forming around AI follow-up automation for service businesses.
```

### Missing Validation

```text
Intent:
Google Search not enabled.

Behavior:
GitHub not enabled.

Professional normalization:
LinkedIn not enabled and access-gated.

Broad demand:
Google Trends access not available.
```

### Recommendation

```text
Enable Google Search next.

Reason:
The current evidence shows repeated pain, but the system cannot yet validate active web discovery, existing solution landscape, tutorials, or comparison behavior.
```

## Implementation Tickets

### 1. Define Category Formation MVP scope

Role:

Founding Full-Stack Data Systems Engineer

Priority:

High

Acceptance criteria:

- First user is defined as founder / growth researcher / product strategist.
- First domain is defined as AI tools.
- First source is Reddit.
- First signal type is repeated pain and product-category formation.
- Out-of-scope sources are documented.

### 2. Define category formation data model

Role:

Data Platform Engineer

Priority:

High

Acceptance criteria:

- `category_candidates` schema is defined.
- `category_evidence` schema is defined.
- `category_aliases` schema is defined.
- `category_scores` schema is defined.
- Schemas link to normalized evidence packets.

### 3. Build Reddit Category Pain connector configuration

Role:

Backend Integrations Engineer

Priority:

High

Acceptance criteria:

- Initial subreddit list is configurable.
- Query terms are configurable.
- Posts and comments are normalized into evidence packets.
- API constraints and retention considerations are documented.
- Connector records source health and checkpoints.

### 4. Build category pattern detector V0

Role:

Search / Ranking / Applied ML Engineer

Priority:

High

Acceptance criteria:

- Detects repeated pain phrases.
- Detects tool requests.
- Detects workaround language.
- Detects AI category language.
- Detects comparison language.
- Stores pattern type and match reason.

### 5. Build category grouping V0

Role:

Search / Ranking / Applied ML Engineer

Priority:

High

Acceptance criteria:

- Groups evidence into candidate categories.
- Uses deterministic phrase/workflow similarity first.
- Stores category label and description.
- Links evidence to category candidates.
- Supports manual review and correction.

### 6. Build category scoring V0

Role:

Search / Ranking / Applied ML Engineer

Priority:

High

Acceptance criteria:

- Computes pain specificity.
- Computes repeat frequency.
- Computes cross-community spread.
- Computes request intent.
- Computes workaround intensity.
- Computes AI substitution fit.
- Computes hype/spam/saturation penalties.
- Outputs score and confidence band.

### 7. Build missing validation detector for categories

Role:

Search / Ranking / Applied ML Engineer

Priority:

High

Acceptance criteria:

- Detects missing intent validation.
- Detects missing behavior validation.
- Detects missing professional normalization.
- Detects missing broad demand validation.
- Feeds Source Enablement Recommender.

### 8. Build Source Enablement recommendations for category candidates

Role:

Founding Full-Stack Data Systems Engineer

Priority:

High

Acceptance criteria:

- Recommends Google Search when intent is missing.
- Recommends HN when technical/startup validation is missing.
- Recommends GitHub when build behavior is relevant.
- Marks Google Trends as gated or possibly too early.
- Marks LinkedIn as useful but access-gated.
- Recommendation includes reason, expected lift, requirements, and risk.

### 9. Build ranked emerging categories feed

Role:

Frontend Data Visualization Engineer

Priority:

High

Acceptance criteria:

- Feed shows ranked category candidates.
- Each row shows score, confidence, communities, evidence count, freshness, and next source.
- User can select a category.
- Empty/loading/error states exist.

### 10. Build category detail page

Role:

Frontend Data Visualization Engineer

Priority:

High

Acceptance criteria:

- Page shows category summary.
- Page shows evidence snippets.
- Page shows pattern breakdown.
- Page shows score components.
- Page shows missing validation.
- Page shows what to enable next.

### 11. Build dashboard API for category radar

Role:

Founding Full-Stack Data Systems Engineer

Priority:

High

Acceptance criteria:

- API returns ranked category candidates.
- API returns category details.
- API returns evidence snippets.
- API returns score components.
- API returns missing validation.
- API returns enablement recommendations.

### 12. Create first evaluation set

Role:

Search / Ranking / Applied ML Engineer

Priority:

Medium

Acceptance criteria:

- At least 25 category candidates are reviewed.
- Each candidate is labeled real opportunity, false positive, too early, duplicate, saturated, or ambiguous.
- Review reasons are captured.
- Top failure patterns are summarized.

## First 30-Day Build Plan

### Week 1: Define And Set Up

Build:

- repository structure
- Postgres schema draft
- source node declarations
- category data model
- Reddit connector skeleton

Research:

- final subreddit list
- Reddit API constraints
- first category examples
- initial phrase patterns

### Week 2: Ingest And Normalize

Build:

- Reddit ingestion
- evidence packet normalization
- raw payload pointer strategy
- connector checkpoints
- source health metadata

Research:

- evidence quality
- spam/affiliate patterns
- subreddit-specific relevance

### Week 3: Detect And Score

Build:

- category pattern detector
- category grouping
- scoring V0
- missing validation detector
- source enablement recommender for categories

Research:

- false positives
- category naming
- score component weights

### Week 4: Dashboard V0

Build:

- ranked category feed
- category detail page
- evidence snippets
- missing validation panel
- what-to-enable-next panel

Research:

- user reaction
- which recommendation feels most useful
- which category examples are compelling

## Success Criteria

The first implementation succeeds if the user can see:

```text
Here are emerging AI product categories.
Here is the repeated pain behind each one.
Here are the communities where the pain appears.
Here is why the category may be forming.
Here is what validation is missing.
Here is the next source to enable.
```

Quantitative targets for V0:

```text
At least 25 candidate categories reviewed.
At least 5 plausible category formation signals found.
At least 3 source enablement recommendations generated per category.
At least 1 category detail page compelling enough for a founder/product user.
```

## Key Risks

### Too Much Generic AI Hype

Risk:

The system may surface generic AI enthusiasm instead of specific product opportunities.

Mitigation:

- require pain specificity
- require workflow language
- penalize vague hype
- prioritize tool requests and workaround language

### Category Grouping Is Too Loose

Risk:

Unrelated posts may be grouped into one fake category.

Mitigation:

- start deterministic
- use negative filters
- show evidence snippets
- support manual correction
- add semantic clustering later

### Reddit Is Noisy

Risk:

Posts may include spam, affiliate marketing, or shallow discussion.

Mitigation:

- subreddit allowlist
- spam/affiliate penalties
- actor/community quality signals
- evidence review UI

### No Corroboration Yet

Risk:

Reddit-only signals may be too weak.

Mitigation:

- make confidence bands conservative
- show missing validation prominently
- recommend Google Search, HN, or GitHub as next sources

## Explicit Non-Goals

Do not build these in V0:

- LinkedIn integration
- Google Trends API integration
- stock price integration
- Polymarket integration
- real-time monitoring
- black-box ML ranking
- all-source dashboard
- enterprise tenant controls

These remain important, but they are not necessary to prove Category Formation Radar V0.

## Strategic Rationale

This slice proves the long-term system better than a generic HN trend feed because it exercises the full product thesis:

```text
source intelligence
category formation
early noisy signals
evidence packets
ranked opportunity feed
missing validation
what-to-enable-next recommendations
founder/product use case
```

It also creates a sharper story:

```text
Signals finds emerging AI product opportunities from repeated user pain before categories become obvious.
```

That is easier to understand, demo, sell, and improve than a broad internet signal monitor.

## Signature

Signed:

```text
Codex, OpenAI
Engineering research and architecture assistant
```

Timestamp:

```text
2026-04-18 22:13:58 EDT
```

