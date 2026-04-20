# AI Business Operating System (AI-BOS)

A multi-agent AI company OS — CEO gives commands, 8 agents execute autonomously.

## Project Structure

```
ai-bos/
├── agents/              # Individual agent system prompts + logic
│   ├── orchestrator.js
│   ├── memory.js
│   ├── architect.js
│   ├── hr.js
│   ├── devops.js
│   ├── security.js
│   ├── marketing.js
│   └── finance.js
├── memory/              # Memory schema, storage, contradiction detection
│   ├── schema.js
│   ├── store.js
│   └── contradictions.js
├── orchestrator/        # Pipeline engine, task routing, dependency management
│   ├── pipeline.js
│   ├── router.js
│   └── synthesiser.js
├── integrations/        # Phase 2 — GitHub, Slack, SendGrid, Vercel
│   ├── github.js
│   ├── slack.js
│   ├── sendgrid.js
│   └── vercel.js
├── ui/                  # Frontend dashboard
│   └── index.html
├── config/              # API keys, agent config, environment
│   ├── agents.config.js
│   └── .env.example
├── docs/                # Architecture docs
│   └── architecture.md
├── index.js             # Entry point
├── package.json
└── README.md
```

## Phases

| Phase | What gets built | Status |
|-------|----------------|--------|
| Phase 1 | All 8 agents + orchestrator + memory in browser | ✅ Prototype done |
| Phase 2 | GitHub, Slack, SendGrid, Vercel integrations | 🔜 Next |
| Phase 3 | Parallel execution, long-running projects, learning loops | 🔜 Later |

## Quick Start

```bash
# Install dependencies
npm install

# Add your Anthropic API key to config/.env
cp config/.env.example config/.env

# Run the dashboard
npm start
```

## Architecture

- **CEO** issues natural language commands
- **Orchestrator** decomposes into tasks, enforces dependency order
- **Memory Agent** loads context before each agent acts, records everything after
- **6 Specialist Agents** each own their domain: Architect, HR, DevOps, Security, Marketing, Finance
- **Storage** — localStorage (session cache) + flat JSON file (persistent memory log)

## Agent Responsibility Map

| Agent | Owns | Does NOT own |
|-------|------|-------------|
| Architect | System design, tech stack, code scaffolding | Infra provisioning, hiring |
| HR | Job specs, onboarding, org structure | Salary legal advice, payroll |
| DevOps | CI/CD, infra planning, deployments | App architecture, security policy |
| Security | Threat models, policies, compliance | Infra implementation, code |
| Marketing | Strategy, copy, campaigns | Product decisions, budget sign-off |
| Finance | Budgets, ROI, cost models | Vendor selection, legal/tax |
