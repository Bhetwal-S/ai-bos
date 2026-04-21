# 🤖 AI-BOS — AI Business Operating System

Live at **[getaibos.com](https://getaibos.com)**

An autonomous, multi-agent business operating system that runs your company 24/7.
Built with Node.js, Express, WebSockets, and the Anthropic Claude API.

---

## 🚀 What's Built

### Pages & Features
| Page | URL | Description |
|---|---|---|
| Landing Page | `/` | Public marketing page |
| Dashboard | `/dashboard` | Command center with live KPIs |
| Analytics | `/analytics` | Charts, heatmap, dept scorecard |
| Calendar | `/calendar` | Smart calendar with agent-scheduled events |
| AI Insights | `/insights` | Deep analysis, risk matrix, opportunities |
| Approval Queue | `/approval-queue` | Review & approve agent actions |
| Agent Goals | `/goals` | Goal tracking per agent |
| Identity Hub | `/identity-hub` | User directory & access control |
| Company Hub | `/company-hub` | Internal docs, SOPs, wikis |
| Settings | `/settings` | Workspace config, integrations |
| War Room | `/war-room` | Cross-department messaging |
| Agent Council | `/agent-council` | Live agent meeting feed |

### Departments
| Department | URL |
|---|---|
| 🎫 IT & DevOps | `/department/it` |
| 💰 Finance | `/department/finance` |
| 👥 HR & Talent | `/department/hr` |
| 📣 Marketing | `/department/marketing` |
| 💼 Sales & CRM | `/department/sales` |
| ⚖️ Legal | `/department/legal` |
| ⚙️ Operations | `/department/operations` |

---

## 🤖 AI Agents

| Agent | Role | Department | What they do |
|---|---|---|---|
| 🔵 Ada | CFO | Finance | Monitors invoices, flags overdue payments, sends reminders |
| 🟢 Maxwell | CMO | Marketing | Tracks campaigns, flags zero-lead campaigns |
| 🟣 Nova | CHRO | HR | Employee onboarding, performance tracking |
| 🔴 Viktor | CTO | IT | Critical ticket alerts, infrastructure monitoring |
| 🟠 Chase | CSO | Sales | Pipeline tracking, stale deal nudges |
| ⚫ Counsel | CLO | Legal | Contract expiry alerts, risk monitoring |

Agents run autonomously on a cycle — analysing data, firing triggers, queuing actions, and reporting insights.

---

## ⚡ Autonomous Trigger System

Agents fire automatically on events:
- Critical IT ticket created → Slack alert
- Invoice overdue → Email client reminder (needs approval)
- New sales contact → Create qualification task
- Contract expiring → Slack warning
- Campaign with 0 leads → War Room flag
- Stale deal → Follow-up nudge
- New employee → Onboarding thread

Actions are either **auto-approved** (routine) or **queued for human approval** (important).

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (ESM modules) |
| Server | Express 4 |
| Real-time | WebSockets (ws package) |
| AI | Anthropic Claude API (@anthropic-ai/sdk) |
| Email | SendGrid (raw fetch — no extra package) |
| Auth | JWT + bcryptjs |
| Storage | Flat JSON files in `knowledge/` |
| Frontend | Vanilla JS + Chart.js 4.4 |
| Hosting | Docker + Cloudflare Tunnel |
| Domain | getaibos.com (Cloudflare) |
| CI/CD | GitHub (Bhetwal-S/ai-bos) |

---

## 📁 Project Structure

```
ai-bos/
├── index.js                    # Main Express server + all routes
├── agent-council/
│   ├── council.js              # Agent council cycle & prompts
│   ├── triggers.js             # Autonomous trigger engine
│   ├── actions.js              # Action queue (email, slack, records)
│   └── goals.js                # Agent goal tracking
├── departments/
│   └── store.js                # All dept data stores (JSON)
├── auth/
│   └── auth.js                 # JWT auth, users, invites
├── chief-ai/
│   ├── index.js                # Chief AI query engine
│   ├── chat.js                 # Conversational AI (dashboard)
│   └── knowledge-store.js      # Company knowledge base
├── orchestrator/
│   ├── pipeline.js             # Agent pipeline runner
│   ├── scheduler.js            # Cron-style scheduler
│   └── router.js               # Request routing
├── integrations/
│   ├── slack.js                # Slack webhook
│   ├── telegram.js             # Telegram bot
│   └── github.js               # GitHub integration
├── memory/
│   └── store.js                # Agent memory persistence
├── knowledge/                  # Runtime data (gitignored)
│   ├── settings.json           # Workspace settings
│   ├── users.json              # Registered users
│   └── departments/            # All dept JSON files
├── ui/
│   ├── index.html              # Dashboard
│   ├── landing.html            # Public landing page
│   ├── login.html              # Auth page
│   ├── analytics.html          # Analytics dashboard
│   ├── calendar.html           # Smart calendar
│   ├── insights.html           # AI insights
│   ├── approval-queue.html     # Action approval
│   ├── goals.html              # Agent goals
│   ├── identity-hub.html       # User directory
│   ├── company-hub.html        # Internal docs
│   ├── settings.html           # Settings
│   ├── war-room.html           # Messaging
│   ├── agent-council.html      # Council feed
│   ├── manifest.json           # PWA manifest
│   ├── sw.js                   # Service worker (offline)
│   └── departments/            # All 7 dept pages
├── seed.js                     # Test data seeder
├── Dockerfile                  # Docker build
├── docker-compose.yml          # Docker compose
└── .env                        # Environment variables (never commit)
```

---

## ⚙️ Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-...       # Required — Claude AI
SENDGRID_API_KEY=SG....            # Email sending
JWT_SECRET=...                     # Auth secret (generate random)
PORT=3001                          # Server port
TELEGRAM_BOT_TOKEN=...             # Optional notifications
TELEGRAM_CHAT_ID=...               # Optional notifications
GITHUB_TOKEN=ghp_...               # Optional GitHub integration
```

---

## 🐳 Running Locally

```bash
# Clone
git clone https://github.com/Bhetwal-S/ai-bos.git
cd ai-bos

# Setup env
cp .env.example .env
# Edit .env with your real keys

# Option A — Docker (recommended)
docker compose up -d --build

# Option B — Direct node
npm install
node index.js

# Seed test data
node seed.js

# Clear seed data later
node seed.js --clear
```

Visit `http://localhost:3001`

---

## 🌐 Production Deployment

Running on Docker Desktop (Windows) with Cloudflare Tunnel:

```
Tunnel ID:  aacd4761-0392-4be6-a465-7e958bc4d4d4
Config:     C:\Users\User\.cloudflared\config.yml
Tunnel app: C:\Users\User\cloudflared.exe
Service:    Windows Scheduled Task "CloudflaredTunnel" (runs as SYSTEM, auto-starts on boot)
Docker:     container name "ai-bos", port 3001:3001
```

After any code change:
```powershell
cd C:\Users\User\programmer\ai-bos
docker compose up -d --build
```

---

## 📋 What's Next

| Feature | Status | Notes |
|---|---|---|
| 🌐 Landing page | ✅ Done | Public marketing page at getaibos.com |
| 📅 Calendar | ✅ Done | Agent-scheduled events |
| 🧠 AI Insights | ✅ Done | Risk matrix, opportunities, health score |
| 📱 PWA install | ✅ Done | Add to home screen on mobile |
| 📊 Analytics | ✅ Done | Charts, heatmap, dept scorecard |
| 📧 SendGrid email | ✅ Done | Agents send real emails |
| ⚡ Approval queue | ✅ Done | Human-in-the-loop agent actions |
| 💳 Stripe billing | ⏳ Next | Need Stripe secret key |
| 🔔 Push notifications | ⏳ Next | Need Apple/Google dev account |
| 🌍 Multi-tenant | ⏳ Future | Multiple companies on one platform |
| 📊 Public API | ⏳ Future | Let clients integrate |

---

## 🗑️ Reset Test Data

```bash
node seed.js --clear
```

---

Built with Claude Code · Deployed at [getaibos.com](https://getaibos.com) · GitHub: [Bhetwal-S/ai-bos](https://github.com/Bhetwal-S/ai-bos)
