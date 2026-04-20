# Architecture — AI Business Operating System

## Core Principle
CEO issues natural language commands. The system decomposes, routes, executes, and reports autonomously. No agent reaches into another agent's domain. Cross-domain work flows through the Orchestrator only.

## The 5-Stage Pipeline

```
CEO Command
    │
    ▼
[1] RECEIVE        — Command logged to memory
    │
    ▼
[2] LOAD MEMORY    — Memory Agent assembles context packet from store
    │
    ▼
[3] DECOMPOSE      — Orchestrator plans tasks, selects agents, orders by dependency
    │
    ▼
[4] EXECUTE        — Specialist agents run in dependency order
    │              — Contradiction detection runs after all agents complete
    ▼
[5] SYNTHESISE     — Orchestrator produces CEO-ready executive summary
                   — Memory Agent records decisions, projects, outcomes
```

## Agent Dependency Order

```
Architect → DevOps → Security → HR → Marketing → Finance
```

Rationale:
- Architect defines the tech stack before DevOps plans infrastructure
- DevOps infra plan must exist before Security audits it
- HR hiring plan follows after tech and security requirements are known
- Marketing runs after product/tech scope is confirmed
- Finance costs everything last, with full context from all other agents

## Memory Architecture

### Record Types
| Type | Purpose |
|------|---------|
| decision | A confirmed choice — never deleted, only superseded |
| project | Active or completed initiative |
| constraint | Hard limit the system must respect |
| contradiction | Conflicting outputs — blocks pipeline until resolved |
| preference | CEO/company style preferences |
| outcome | Result of a completed task |
| context | Raw command log |

### Context Packet Assembly (per pipeline run)
1. Last 5 decisions
2. Last 5 constraints
3. Last 3 active projects
4. All unresolved contradictions
5. Last 3 preferences
6. Last 5 general records

### Storage
- Phase 1: Flat JSON file (`memory/memory.log.json`)
- Phase 2: Replace `memory/store.js` with a database adapter (Postgres, Supabase, etc.)
- The interface stays identical — `store.write()`, `store.getRecent()`, `store.getContextPacket()`

## Contradiction Detection Rules

1. **Budget mismatch** — DevOps cost > Finance ceiling × 1.3
2. **Timeline mismatch** — Agent timelines diverge by 2×
3. **Constraint violation** — Any output exceeds a recorded constraint
4. **Duplicate launch** — New launch command when active launch project exists in memory

## Adding a New Agent

1. Add entry to `config/agents.config.js` with `id`, `name`, `keywords`, `systemPrompt`
2. Add routing keywords to trigger the agent
3. No other files need changing — the pipeline picks it up automatically

## Phase Roadmap

### Phase 1 (current)
- All 8 agents working via Express + SSE
- Memory persisting to local JSON file
- Contradiction detection
- CEO dashboard at `ui/index.html`

### Phase 2
- Activate `integrations/github.js` — Architect/DevOps push real code
- Activate `integrations/slack.js` — Orchestrator posts to CEO channel
- Activate `integrations/sendgrid.js` — Marketing/HR send real emails
- Activate `integrations/vercel.js` — DevOps deploys to staging
- Replace memory store with Postgres/Supabase

### Phase 3
- Parallel agent execution (Promise.all for independent agents)
- Long-running project tracking across sessions
- Learning loops — Memory Agent surfaces patterns
- CEO confidence scoring per agent
