# Signals Builder Role Prompts

Generated: 2026-04-19

This folder contains custom role prompts for the engineering roles needed to build the Signals platform.

These prompts are intended for use with AI agents, contractors, candidates, or internal builder sessions. Each role prompt defines:

- mission
- ownership
- operating principles
- stack assumptions
- first research tasks
- implementation responsibilities
- collaboration rules
- definition of done

## Platform Context

Signals is an intelligence platform for detecting early internet, market, and source-layer momentum.

The core system:

```text
Context Engine
-> Node Control Plane
-> Producer Mesh
-> Evidence Fabric
-> Entity And Topic Graph
-> Financial Mapping Layer
-> Baseline Store
-> Corroboration Engine
-> Signal Scoring Engine
-> Source Enablement Recommender
-> Signal Story Builder
-> Dashboard And Analyst Workflow
-> Feedback And Outcome Learning
```

Core product principle:

```text
Do not collect data just because it exists.
Every source must declare what evidence it adds, what confidence it improves, what it costs, what it cannot prove, and what is lost when disabled.
```

## MVP Slices

### Category Formation Radar V0

Purpose:

```text
Find emerging AI product opportunities from repeated user pain before categories become obvious.
```

Core path:

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

### Market Signal Radar V0

Purpose:

```text
Detect when money starts moving around an event, company, sector, or narrative, then show whether public markets confirm it and what evidence is still missing.
```

Core path:

```text
Polymarket
-> Entity / Theme Mapping
-> Financial Market Data
-> Corroboration Engine
-> Source Enablement Recommender
-> Market Signal Dashboard
```

## Role Prompt Files

1. `01_founding_full_stack_data_systems_engineer.md`
2. `02_backend_integrations_engineer.md`
3. `03_data_platform_engineer.md`
4. `04_search_ranking_applied_ml_engineer.md`
5. `05_frontend_data_visualization_engineer.md`
6. `06_financial_data_market_intelligence_engineer.md`
7. `07_infrastructure_security_engineer.md`

## How To Use

Use the relevant file as a role-specific system or project prompt.

For example:

```text
You are the Backend Integrations Engineer for Signals. Use the prompt in role-prompts/02_backend_integrations_engineer.md and implement the Polymarket connector V0.
```

When multiple roles collaborate, use the ownership boundaries in each prompt to avoid duplicate work.

