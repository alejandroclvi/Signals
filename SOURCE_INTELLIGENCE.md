# Source Intelligence

## Purpose

Source Intelligence is the layer of Signals that explains where a signal comes from, where it spreads, and what each platform contributes to the interpretation.

The product should not treat platforms as interchangeable sources of mentions. A Reddit thread, TikTok trend, GitHub issue, LinkedIn post, Google search query, and G2 review can all point to the same underlying signal, but each one means something different.

The core idea:

> Signals are not just topics. They are topics moving through different environments, and each environment changes what the signal means.

Source Intelligence helps answer:

- Where did this signal start?
- Where is it spreading?
- Which platform gives the strongest evidence?
- Is the signal still niche, or becoming mainstream?
- Is it only being discussed, or is it becoming behavior?
- Which platforms are early indicators?
- Which platforms are lagging indicators?
- What validation is missing?
- Which source should we enable next, and what would it add?

## Why This Matters

Most monitoring tools flatten all sources into the same metric:

```text
Reddit mentions: 188
X mentions: 94
LinkedIn mentions: 22
```

This is shallow because different platforms reveal different kinds of truth.

Better:

```text
Origin: Reddit
Strongest evidence: Reddit + Search
Fastest spread: LinkedIn
Current stage: Validation moving into adoption
Missing evidence: Reviews, procurement, job posts
Interpretation: The topic is moving from curiosity into workflow-specific evaluation, but economic commitment is still early.
```

The goal is not to collect every source. The goal is to understand how different sources contribute to a signal story.

## Platform Roles In The Signal Lifecycle

Signals often move through a lifecycle:

```text
Origin -> Validation -> Amplification -> Adoption -> Economic Commitment
```

Example path:

```text
Reddit complaint
-> Hacker News discussion
-> X/Twitter narrative
-> LinkedIn industry posts
-> GitHub projects
-> job postings
-> product reviews
-> search demand
```

This path is more meaningful than a raw increase in mentions. It shows that a topic may be moving from conversation into intent, behavior, and economic activity.

## Signal Layers

A simple mental model:

```text
Conversation Signals
People are talking.

Intent Signals
People are searching, asking, comparing, complaining.

Behavior Signals
People are trying, building, switching, integrating.

Economic Signals
People are buying, hiring, funding, selling, or budgeting.
```

Different sources sit at different points in this model.

```text
Conversation:
X, TikTok, LinkedIn, Reddit, news comments

Intent:
Reddit, Google Search, YouTube Search, forums, reviews

Expectation:
Polymarket, prediction markets, liquid event markets

Behavior:
GitHub, Stack Overflow, Discord, app stores, tutorials

Economic:
G2, job posts, funding, marketplaces, procurement, pricing pages

Capital Market Response:
stock prices, ETFs, indices, sector baskets, options data later
```

The product becomes more valuable when it can show a signal moving from one layer to another.

It becomes more operational when it can also show which inactive source layer would most reduce uncertainty.

Example:

```text
Current evidence:
Conversation + behavior + capital-market response

Missing:
Intent + primary truth

Recommendation:
Enable Google Search for active web discovery and SEC / Primary for official confirmation.
```

## Platform Categories

### 1. Reddit, Forums, And Niche Communities

Examples:

- Reddit
- Hacker News comments
- Indie Hackers
- specialized forums
- Discord communities
- Slack groups
- Telegram groups
- Facebook Groups
- industry forums

Primary role:

> Origin, pain discovery, early demand, and early validation.

Useful for detecting:

- unmet needs
- frustrations
- workarounds
- recommendation requests
- comparison behavior
- early community formation
- natural customer language
- practical barriers to adoption

Example signal:

> Is there a tool that does this without making me use five different apps?

Interpretation:

Users are not just discussing a topic. They are describing a gap, workaround, or pain point.

Strengths:

- specific problem language
- authentic complaints
- niche expertise
- long discussion threads
- visible community context

Weaknesses:

- not always representative of broader markets
- can be overly skeptical or niche
- subreddit cultures vary heavily
- spam and astroturfing are possible

### 2. X/Twitter, Threads, Bluesky, And Mastodon

Primary role:

> Narrative acceleration, public commentary, amplification, backlash, and elite attention.

Useful for detecting:

- memes
- expert commentary
- founder and investor narratives
- public consensus shifts
- fast-moving opinions
- backlash
- hype cycles
- repeated claims or frames

Interpretation:

X-like platforms are strong for narrative momentum but weak as standalone proof of demand. A topic can look large there without meaningful adoption.

Strengths:

- speed
- public commentary
- network effects
- influencer amplification
- narrative shifts

Weaknesses:

- high noise
- performative posting
- herd behavior
- low evidence of real behavior unless paired with other sources

### 3. LinkedIn

Primary role:

> Professional normalization, B2B validation, and organizational legitimacy.

Useful for detecting:

- executives discussing a topic
- employees changing titles or descriptions
- companies announcing experiments
- consultants packaging services
- B2B buyers describing pain
- hiring posts
- agency or fractional service offers
- industry language becoming acceptable

Interpretation:

When a topic appears on LinkedIn, it may be becoming safe, budget-relevant, or institutionally acceptable.

Strengths:

- professional context
- B2B relevance
- organizational adoption signals
- role and title changes
- hiring and service formation

Weaknesses:

- self-promotion
- delayed compared to niche communities
- polished language may hide real pain
- engagement can be shallow

### 4. TikTok, Instagram Reels, And YouTube Shorts

Primary role:

> Consumer attention, cultural adoption, status behavior, and mainstream spread.

Useful for detecting:

- consumer trends
- product discovery
- visual demonstrations
- status behavior
- tutorials
- "I tried this" content
- mainstream language
- creator-driven acceleration

Interpretation:

Short-form video is strong when a behavior becomes visually demonstrable or socially contagious. Durability matters because trends can fade quickly.

Strengths:

- cultural velocity
- mass consumer reach
- visual proof
- creator-led adoption
- repeated formats and memes

Weaknesses:

- trend volatility
- algorithmic distortion
- weak evidence of durable behavior unless supported elsewhere
- hard to separate entertainment from intent

### 5. YouTube, Podcasts, Newsletters, And Substack

Primary role:

> Explanation, education demand, authority building, and narrative stabilization.

Useful for detecting:

- tutorials
- explainers
- product reviews
- comparisons
- long-form debates
- "how to get started" content
- repeated expert coverage
- paid newsletter analysis

Interpretation:

When long-form content appears, a topic may be moving from curiosity to learning. People need enough context to invest time.

Strengths:

- depth
- expert framing
- durable content
- education intent
- useful comparisons

Weaknesses:

- slower than short-form or social feeds
- creator incentives can skew coverage
- may reflect content opportunity more than actual adoption

### 6. Social News And Curation Platforms

Examples:

- Hacker News
- Product Hunt
- Lobsters
- Designer News
- specialized aggregators

Primary role:

> Early-adopter validation, launch visibility, technical skepticism, and expert critique.

Useful for detecting:

- technical interest
- product launches
- maker and investor attention
- critical discussion
- early tool discovery
- skepticism from expert users

Interpretation:

These platforms are valuable for early validation, especially in technical markets. They are not necessarily representative of mainstream demand.

Strengths:

- expert feedback
- early adopter density
- launch visibility
- technical critique
- concise market reaction

Weaknesses:

- narrow audience
- launch activity can be gamed
- skepticism can be overrepresented
- attention may not convert to durable usage

### 7. Developer Platforms

Examples:

- GitHub
- npm
- PyPI
- Stack Overflow
- package registries
- developer docs
- issue trackers

Primary role:

> Implementation, technical adoption, ecosystem growth, and friction detection.

Useful for detecting:

- new repositories
- stars and forks
- issue activity
- package downloads
- Stack Overflow questions
- SDK usage
- integration requests
- developer complaints
- documentation gaps

Interpretation:

For technical products and developer ecosystems, this layer is crucial because it shows behavior beyond conversation.

Weak signal:

> A repo gets stars.

Stronger signal:

> Users file issues, request integrations, build plugins, ask implementation questions, and publish examples.

Strengths:

- behavioral evidence
- implementation detail
- ecosystem visibility
- technical adoption
- integration friction

Weaknesses:

- limited to technical markets
- stars can be vanity metrics
- package downloads can be noisy
- enterprise usage may be invisible

### 8. App Stores, Review Sites, And Marketplaces

Examples:

- App Store
- Google Play
- Chrome Web Store
- Shopify App Store
- G2
- Capterra
- Trustpilot
- Amazon
- Etsy
- Steam
- Airbnb
- Yelp

Primary role:

> Buyer pain, user experience, product gaps, and economic validation.

Useful for detecting:

- complaints
- feature requests
- switching language
- satisfaction gaps
- competitor comparisons
- review volume growth
- price sensitivity
- repeated unmet needs

Interpretation:

Reviews are closer to actual usage and purchase behavior than social chatter. A repeated complaint in G2 or app reviews can be more commercially meaningful than many vague social posts.

Strengths:

- buyer and user evidence
- specific product gaps
- commercial context
- competitor comparisons
- repeated dissatisfaction

Weaknesses:

- review manipulation
- selection bias
- slower than social discussion
- source access can be fragmented

### 9. Search And Discovery Data

Examples:

- Google Trends
- keyword tools
- YouTube Search
- Reddit search behavior if available
- Wikipedia pageviews
- autocomplete patterns

Primary role:

> Active curiosity, comparison intent, category demand, and mainstream awareness.

Useful for detecting:

- problem discovery
- comparison queries
- category formation
- mainstream curiosity
- education demand
- purchase research

High-intent query patterns:

```text
best alternative to X
how to automate Y
is X worth it
X vs Y
tools for X
how to fix Y
```

Interpretation:

Search can be stronger than passive social engagement because the user is actively seeking something.

Strengths:

- active intent
- broad market visibility
- category demand
- comparison and purchase behavior

Weaknesses:

- query data can be delayed or sampled
- lower context than discussion platforms
- hard to attribute to specific audience segments

### 10. Jobs, Funding, Company, And Procurement Data

Examples:

- LinkedIn Jobs
- Indeed
- Wellfound
- company career pages
- Crunchbase
- SEC filings
- government procurement
- vendor pages
- case studies
- RFPs

Primary role:

> Economic commitment, institutional adoption, and budget allocation.

Useful for detecting:

- job postings with specific skills
- new departments
- vendor selection language
- RFPs
- funding announcements
- acquisition activity
- partnerships
- case studies
- budget allocation

Interpretation:

This layer usually appears later, but it is powerful validation because organizations are allocating money, headcount, or strategy.

Strengths:

- strong economic evidence
- institutional commitment
- budget and hiring visibility
- strategic movement

Weaknesses:

- lagging indicator
- harder to map to early signals
- can be sparse for niche markets
- public data may miss private adoption

### 11. Prediction Markets And Money-Backed Expectations

Examples:

- Polymarket
- other liquid event or prediction markets where official access is available

Primary role:

> Money-backed expectation, event probability, disagreement, and repricing.

Useful for detecting:

- probability shocks
- conviction around future outcomes
- disagreement between money and social attention
- early market movement before media/search pickup
- event narratives that are gaining or losing credibility
- resolved outcomes that can become evaluation labels

Interpretation:

Prediction markets do not measure general public sentiment or product demand. They measure priced belief among market participants under the constraints of liquidity, market wording, resolution rules, fees, and participant access.

This source is strongest when the market is liquid, the spread is tight, the outcome is clearly worded, and price movement aligns with independent social, search, news, or primary-source evidence.

Strengths:

- money-backed belief rather than casual mention volume
- clear probability time series
- useful for resolvable event signals
- can contradict hype when social attention rises but prices do not move
- resolved markets can create feedback labels

Weaknesses:

- only available when an active market exists
- thin markets can move on small trades
- ambiguous market wording can mislead interpretation
- participants are not representative of the broader public
- price is not truth; it is implied probability from market activity

### 12. Stock Prices And Capital Market Response

Examples:

- stock prices
- ETFs
- indices
- sector baskets
- volume
- volatility
- options data later

Primary role:

> Public-market repricing, sector reaction, and capital-market validation.

Useful for detecting:

- abnormal stock moves
- sector rotation
- public-market response to a narrative
- competitor sympathy moves
- volume and volatility spikes
- market ignoring social hype
- market contradiction of a popular narrative

Interpretation:

Stock prices do not prove that an internet signal caused a market move. They show that public markets are repricing companies, sectors, or baskets that may be related to the signal.

This source is strongest when the system can map a signal to public companies, compare performance against a benchmark, and show that multiple related assets are moving together.

Strengths:

- money-moving validation layer
- useful for public-company and sector signals
- good contradiction check when attention is high but market response is absent
- can show whether a topic matters financially

Weaknesses:

- noisy and multi-causal
- requires entity-to-ticker mapping
- needs benchmark normalization
- real-time data may require licensing
- not useful for private or non-financial signals

## Source Contribution Model

Each source should contribute differently to signal interpretation.

Suggested contribution dimensions:

- volume
- velocity
- acceleration
- source drilldown
- intent
- behavior
- economic commitment
- market expectation
- capital-market response
- actor quality
- platform credibility
- manipulation risk
- source freshness
- audience relevance

Example:

```text
Reddit:
High for pain, demand, frustration, and natural language.

X/Twitter:
High for narrative velocity and amplification.

LinkedIn:
High for professional legitimacy and B2B adoption.

GitHub:
High for implementation and ecosystem behavior.

Reviews:
High for buyer pain and product gaps.

Search:
High for active intent and category demand.

Jobs:
High for economic commitment and institutional adoption.
```

## Visualization Principles

The source layer should not be visualized as a simple source list. It should show movement, meaning, and maturity.

Good source visualizations should answer:

- Where did this signal originate?
- Can I inspect the exact source item behind this evidence?
- Which sources confirm it?
- Which sources amplify it?
- Which sources show behavior?
- Which sources show economic commitment?
- What is missing?
- Is the signal moving forward in maturity or staying trapped in conversation?

System principle:

```text
No evidence without provenance.
No provenance without drilldown.
No replay evidence pretending to be live source evidence.
```

## Visualization 1: Signal Propagation Timeline

This should be the primary visualization for Source Intelligence.

For a selected signal, show platforms as rows and time as columns.

Example:

```text
Signal: AI discovery summaries

                 Week 1   Week 2   Week 3   Week 4
Reddit             **       ***      ****     *****
Hacker News         -        *        **       *
X/Twitter           -        **       ****     ***
LinkedIn            -        -        *        ***
GitHub              -        -        *        **
Google Search       -        *        **       ***
G2 / Reviews        -        -        -        *
Job Posts           -        -        -        *
```

What it answers:

> Is the signal spreading from discussion into intent and behavior?

Why it works:

- shows timing
- shows source spread
- shows maturity
- distinguishes early indicators from lagging indicators

Recommended UI behavior:

- intensity indicates activity
- markers indicate signal type
- annotations explain major jumps
- clicking a cell opens evidence from that source and time period

## Visualization 2: Platform Role Map

This visualization groups platforms by role and draws paths between them.

Example:

```text
Origin
Reddit, Discord, forums

Validation
HN, niche communities, reviews

Amplification
X, TikTok, LinkedIn, YouTube

Behavior
GitHub, Stack Overflow, app stores

Economic Commitment
G2, jobs, funding, procurement
```

Example path:

```text
Reddit -> X/Twitter -> LinkedIn -> Google Search -> G2 Reviews
```

Line thickness should represent the amount or strength of evidence connecting sources.

What it answers:

> How is the signal traveling across the internet?

Why it works:

- shows source roles
- makes platform meaning visible
- helps users understand whether a signal is advancing or looping within the same layer

## Visualization 3: Source Confidence Matrix

A compact matrix showing how much each source contributes to a signal.

Example:

```text
                     Volume   Intent   Behavior   Economic   Confidence
Reddit                 High     High      Medium      Low        High
X/Twitter              High     Low       Low         Low        Medium
LinkedIn               Med      Med       Medium      Med        Medium
GitHub                 Low      Med       High        Low        High
Google Search          Med      High      Low         Med        High
G2 Reviews             Low      High      High        High       High
Job Posts              Low      Low       High        High       High
```

What it answers:

> What kind of evidence does each source provide?

Why it works:

- prevents all mentions from being treated equally
- makes confidence explainable
- shows whether a signal is broad, deep, commercial, or mostly narrative

## Visualization 4: Signal Stage Funnel

Show the current maturity stage of a signal.

Example:

```text
Discovery -> Validation -> Amplification -> Adoption -> Economic Commitment
    ✓             ✓              ✓             partial          open
```

Example readout:

```text
AI discovery summaries
Stage: Early adoption

Discovery: strong
Validation: strong
Amplification: medium
Adoption: emerging
Economic commitment: weak but appearing
```

What it answers:

> How mature is this signal?

Why it works:

- turns messy source data into a simple readout
- helps users compare signals at different stages
- highlights what evidence is still missing

## Visualization 5: Platform Heatmap

For overview dashboards, use a source heatmap.

Rows are platforms or platform groups. Columns are signal types.

Example:

```text
                    Demand   Frustration   Adoption   Narrative   Economic
Reddit                High      High         Medium      Medium      Low
X/Twitter             Low       Medium       Low         High        Low
LinkedIn              Medium    Low          Medium      High        Medium
GitHub                Low       Medium       High        Low         Low
Reviews               High      High         High        Low         High
Search                High      Medium       Medium      Low         Medium
Jobs                  Low       Low          High        Medium      High
```

What it answers:

> Where is each kind of evidence strongest?

Why it works:

- useful for source strategy
- makes blind spots visible
- helps users decide where to look next

## Product Placement

Source Intelligence should live inside the signal detail experience.

Suggested tabs:

```text
Overview
Evidence
Communities
Source Map
Narratives
Actors
Alerts
```

The Source Map tab should include:

- origin platform
- strongest current platform
- fastest-growing platform
- platform spread score
- platform role breakdown
- propagation timeline
- evidence by source
- maturity stage
- missing validation sources

## Example Signal Readout

Signal:

```text
AI discovery summaries
```

Source readout:

```text
Origin: Reddit
Strongest evidence: Reddit + Google Search
Fastest spread: LinkedIn
Current stage: Validation moving into adoption
Missing evidence: Reviews, procurement, job posts
```

Interpretation:

> The topic is moving from curiosity into workflow-specific evaluation. Legal professionals are asking about confidentiality, document volume, and how to integrate AI into review workflows. Economic commitment is still early, but search and LinkedIn activity suggest the conversation is leaving niche communities.

## Example Source Timeline

```text
Week 1:
Reddit posts appear in legal communities. Users ask whether AI can summarize discovery documents without creating confidentiality risk.

Week 2:
Search activity increases around "AI discovery summary" and "AI legal document review." X/Twitter discussion picks up among legaltech founders.

Week 3:
LinkedIn posts appear from consultants and legal operations professionals. A few GitHub projects and implementation discussions appear.

Week 4:
Early review-site mentions and job descriptions begin referencing AI-assisted legal document workflows.
```

Interpretation:

> This is stronger than a single-platform spike because the signal is moving from pain discussion into search, professional validation, and early implementation.

## MVP Source Strategy

The product should not attempt to integrate every platform at once.

Recommended MVP sequence:

### Phase 1: Reddit First

Focus on:

- topic monitoring
- subreddit selection
- signal inbox
- evidence extraction
- intent classification
- community spread

Reason:

Reddit gives strong natural-language evidence of pain, demand, comparison, and early adoption.

### Phase 2: Add Search And Hacker News

Add:

- Google Trends or keyword data
- Hacker News for technical markets
- YouTube search data if relevant

Reason:

Search adds active intent. Hacker News adds early-adopter validation for technical topics.

### Phase 3: Add LinkedIn And X/Twitter

Add:

- professional normalization
- narrative amplification
- public commentary
- expert/influencer spread

Reason:

These sources help show when a signal leaves niche communities and enters broader professional or public conversation.

### Phase 4: Add Reviews, GitHub, Jobs, And Marketplaces

Add:

- G2 and Capterra
- app stores
- GitHub and package registries
- job postings
- marketplace reviews
- Polymarket for resolvable event signals
- stock prices for public-company, sector, and investor-relevant signals

Reason:

These sources validate behavior, economic commitment, money-backed expectations, and capital-market response.

## Source Weighting Guidelines

Do not weight all sources equally.

Example weights by signal type:

```text
Demand:
Reddit, forums, search, reviews

Frustration:
Reddit, forums, reviews, social comments

Adoption:
GitHub, tutorials, app stores, LinkedIn, Reddit

Narrative:
X/Twitter, LinkedIn, newsletters, podcasts, YouTube, Polymarket for resolvable events

Event probability:
Polymarket, news, search, Reddit, primary sources

Public-market response:
stock prices, ETFs, sector baskets, indices, options data later

Economic:
reviews, job posts, funding, procurement, marketplaces, pricing discussions, prediction markets when the question is event-based

Technical implementation:
GitHub, Stack Overflow, package registries, docs, Hacker News

Consumer culture:
TikTok, Instagram, YouTube Shorts, Reddit, search
```

The source weighting model should be transparent and adjustable by context.

## Manipulation And Noise Risks

Every source has different noise characteristics.

Examples:

- Reddit: astroturfing, subreddit-specific bias, moderation effects
- X/Twitter: coordinated posting, influencer herding, performative takes
- LinkedIn: self-promotion, corporate polish, low-friction engagement
- TikTok: algorithmic distortion, trend volatility, entertainment masking intent
- Product Hunt: launch gaming, temporary attention spikes
- GitHub: stars as vanity metrics, bot activity
- Reviews: fake reviews, selection bias
- Search: sampled or delayed data
- Jobs: generic keyword stuffing, slow lag

The product should expose confidence and manipulation risk rather than hiding uncertainty.

## Source Intelligence Principles

### Source Meaning Over Source Count

More sources are not automatically better. The important question is what each source reveals.

### Movement Over Mentions

The product should show how a signal moves across platforms over time.

### Behavior Beats Attention

A small amount of behavior evidence can matter more than a large amount of conversation.

### Missing Evidence Matters

The absence of activity on certain platforms can be useful. If a topic is loud on X but absent from search, reviews, and jobs, it may be mostly narrative.

### Context Changes Source Value

GitHub matters more for developer tools. TikTok matters more for consumer products. LinkedIn matters more for B2B. Reddit matters across many categories but should be weighted by community relevance.

### Every Source Should Link Back To Evidence

Scores and visualizations should always connect back to source posts, comments, queries, reviews, issues, or listings.

## Open Questions

- Which platform category should be added after Reddit?
- Should Source Intelligence be visible in the main dashboard or mostly inside signal detail pages?
- How should source weighting be customized by user context?
- How should the product detect origin when multiple platforms move at the same time?
- What data partnerships or APIs are needed for reliable coverage?
- How should the system distinguish organic source spread from coordinated promotion?
- Should missing source validation reduce confidence or simply appear as an open question?
- How should source freshness and lag be represented visually?

## Product Hypothesis

The value of Signals increases when users can see not only that a topic is moving, but how it is moving through the internet.

The platform layer turns isolated evidence into a signal story:

```text
Where it started
-> who picked it up
-> where it spread
-> what kind of behavior appeared
-> whether money or organizational commitment followed
```

That story is the difference between monitoring internet noise and understanding momentum.
