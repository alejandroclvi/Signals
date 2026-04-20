# Corroboration Engine Research Workspace

Last checked: 2026-04-18

This folder defines how the Corroboration Engine should integrate into Signals.

The short version: the Corroboration Engine is not a producer. It is the validation layer that takes a candidate signal from one or more producers, tests it against independent evidence paths, and returns an explainable confidence judgment.

## Documents

- `CORROBORATION_ENGINE_INTEGRATION.md` - product and system architecture for the engine.
- `DATA_MODEL_AND_SCORING.md` - evidence schema, feature model, scoring logic, and evaluation metrics.
- `PRODUCER_ROUTING_AND_SOURCES.md` - how producers should be routed for corroboration, including current API/access constraints.
- `IMPLEMENTATION_PLAN.md` - phased implementation plan, UI integration, operational risks, and open decisions.

## Main Conclusions

1. Discovery and corroboration must be separate.
   Producers find candidate signals. The Corroboration Engine decides whether the candidates are real, early, durable, manipulated, stale, or missing expected supporting evidence.

2. The system should score evidence packets, not mentions.
   A Reddit post, GitHub repository, Google Trends curve, SEC filing, Stack Exchange question, GDELT article cluster, or Product Hunt launch should all become normalized evidence packets with provenance.

3. Independence matters more than raw volume.
   Ten Reddit posts in related subreddits can be weaker than one Reddit thread plus rising search intent plus GitHub implementation behavior plus buyer-language reviews.

4. Missing evidence is evidence.
   If a developer-tool signal has Reddit pain and Hacker News discussion but no GitHub, Stack Overflow, npm, PyPI, docs, or tutorial movement, the engine should lower confidence or mark it as "conversation only."

5. The first version should be transparent heuristics.
   Start with deterministic scoring, visible feature weights, and analyst feedback. Do not begin with a black-box model before the system has labeled outcomes.

6. The dashboard should expose the reason for confidence.
   Show a corroboration ladder, evidence map, source independence matrix, contradiction panel, and missing validation panel on each signal detail page.

## Recommended First Build

Build V0 around the sources already recommended for the project:

- Reddit
- Hacker News
- GitHub
- Stack Exchange
- Product Hunt
- Polymarket
- financial market data
- Google Custom Search
- Google Trends, if accepted into the alpha
- GDELT or another broad web/news index
- Wikipedia Pageviews for public-interest baselines

This gives Signals enough coverage to test:

- conversation origin
- social/news propagation
- search intent
- developer implementation
- launch attention
- money-backed expectation
- capital-market response
- public-interest movement

## Related Project Documents

- `PROJECT_BRIEF.md`
- `SOURCE_INTELLIGENCE.md`
- `research/producers/README.md`
- `research/producers/_cross_source/PRODUCER_MATRIX.md`
- `research/producers/_cross_source/INTEGRATION_ROADMAP.md`
