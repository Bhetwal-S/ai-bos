// agent-council/council.js
// Autonomous multi-agent council — dept agents collaborate, act, and keep building
// without any human input. Runs on a configurable schedule.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { ITStore, FinanceStore, HRStore, MarketingStore, WarRoomStore, SalesStore, LegalStore, OpsStore } from '../departments/store.js';
import { buildGoalContext, evaluateGoals, getGoals } from './goals.js';
import { queueAction, runAutoApproved } from './actions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COUNCIL_FILE = path.resolve(__dirname, '../knowledge/departments/council/feed.json');
const STATE_FILE   = path.resolve(__dirname, '../knowledge/departments/council/state.json');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Persistence ────────────────────────────────────────────────────
function readFeed() {
  try {
    fs.mkdirSync(path.dirname(COUNCIL_FILE), { recursive: true });
    if (!fs.existsSync(COUNCIL_FILE)) return [];
    return JSON.parse(fs.readFileSync(COUNCIL_FILE, 'utf-8'));
  } catch { return []; }
}

function writeFeed(feed) {
  fs.mkdirSync(path.dirname(COUNCIL_FILE), { recursive: true });
  fs.writeFileSync(COUNCIL_FILE, JSON.stringify(feed, null, 2));
}

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return { running: false, lastRun: null, nextRun: null, intervalMs: 3600000, enabled: false, cycleCount: 0 };
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch { return { running: false, lastRun: null, nextRun: null, intervalMs: 3600000, enabled: false, cycleCount: 0 }; }
}

function writeState(updates) {
  const s = { ...readState(), ...updates };
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  return s;
}

function postToFeed(entry) {
  const feed = readFeed();
  feed.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry });
  // Keep last 200 entries
  writeFeed(feed.slice(0, 200));
  return feed[0];
}

// ── Agent definitions ──────────────────────────────────────────────
const AGENTS = {
  it: {
    name: 'Atlas',
    title: 'IT & DevOps Agent',
    emoji: '☁️',
    color: '#378ADD',
    getDeptContext() {
      const tickets = ITStore.getTickets();
      const registry = ITStore.getRegistry();
      const open = tickets.filter(t => t.status === 'open');
      const crit = tickets.filter(t => t.priority === 'critical' && t.status !== 'closed');
      const blocked = tickets.filter(t => t.status === 'blocked');
      return `IT Department Status:
- Total tickets: ${tickets.length} (${open.length} open, ${crit.length} critical, ${blocked.length} blocked)
- IAM Registry: ${registry.length} agents/users (${registry.filter(r => r.status === 'active').length} active)
- Critical tickets: ${crit.map(t => `"${t.title}" [${t.assignee || 'unassigned'}]`).join(', ') || 'none'}
- Blocked tickets: ${blocked.map(t => `"${t.title}"`).join(', ') || 'none'}`;
    },
    async act(analysis, crossDeptContext) {
      const actions = [];
      const tickets = ITStore.getTickets();
      const critUnassigned = tickets.filter(t => t.priority === 'critical' && !t.assignee && t.status !== 'closed');
      if (critUnassigned.length > 0) {
        // Auto-assign critical unassigned tickets to first active agent
        const activeAgents = ITStore.getRegistry().filter(a => a.status === 'active');
        if (activeAgents.length > 0) {
          const assignee = activeAgents[0].name;
          critUnassigned.slice(0, 2).forEach(t => {
            ITStore.updateTicket(t.id, { assignee, status: 'in-progress' });
            actions.push(`Auto-assigned critical ticket "${t.title}" to ${assignee}`);
          });
        }
      }
      // If finance flagged budget issues, create an infra cost review ticket
      if (crossDeptContext?.financeAlert) {
        const existing = tickets.find(t => t.title.includes('Infrastructure Cost Review'));
        if (!existing) {
          ITStore.addTicket({ title: 'Infrastructure Cost Review', priority: 'high', type: 'infra', description: 'Triggered by Finance Agent: budget pressure detected. Review cloud spend.', assignee: null });
          actions.push('Created "Infrastructure Cost Review" ticket (triggered by Finance Agent)');
        }
      }
      return actions;
    },
  },

  finance: {
    name: 'Ledger',
    title: 'Finance & Ops Agent',
    emoji: '💰',
    color: '#34d399',
    getDeptContext() {
      const sum = FinanceStore.getSummary();
      const invoices = FinanceStore.getInvoices();
      const overdue = invoices.filter(i => i.status === 'overdue');
      const pending = invoices.filter(i => i.status === 'sent');
      const burnRate = sum.expenses;
      const runway = sum.revenue > 0 ? (sum.revenue / burnRate).toFixed(1) : 'N/A';
      return `Finance Department Status:
- Revenue: $${sum.revenue.toLocaleString()} | Expenses: $${sum.expenses.toLocaleString()} | Net: $${sum.net.toLocaleString()}
- Invoices: ${invoices.length} total, ${overdue.length} overdue, ${pending.length} pending ($${pending.reduce((s,i) => s+i.total,0).toLocaleString()})
- Cash efficiency ratio: ${runway}x
- Top categories: ${Object.entries(sum.byCategory || {}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k}: $${v.toLocaleString()}`).join(', ') || 'none'}`;
    },
    async act(analysis, crossDeptContext) {
      const actions = [];
      const invoices = FinanceStore.getInvoices();
      // Mark overdue if past due date
      invoices.filter(i => i.status === 'sent' && i.dueDate && new Date(i.dueDate) < new Date()).forEach(inv => {
        FinanceStore.updateInvoice(inv.id, { status: 'overdue' });
        actions.push(`Marked invoice ${inv.id} (${inv.client}) as overdue`);
      });
      // Flag if net is negative
      const sum = FinanceStore.getSummary();
      if (sum.net < 0 && Math.abs(sum.net) > 5000) {
        return { actions, alert: true }; // Signal to cross-dept context
      }
      return { actions, alert: false };
    },
  },

  hr: {
    name: 'Ember',
    title: 'HR & Talent Agent',
    emoji: '👥',
    color: '#a78bfa',
    getDeptContext() {
      const emps = HRStore.getEmployees();
      const active = emps.filter(e => e.status === 'active');
      const needsOnboard = emps.filter(e => !e.onboarded && e.status === 'active');
      const perf = HRStore.getPerformance();
      const avgRating = perf.length ? (perf.reduce((s,p) => s + +p.rating, 0) / perf.length).toFixed(1) : 'N/A';
      const depts = [...new Set(active.map(e => e.department))];
      return `HR Department Status:
- Headcount: ${active.length} active employees across ${depts.length} departments
- Onboarding queue: ${needsOnboard.length} employees pending onboarding
- Performance: ${perf.length} reviews logged, avg rating ${avgRating}/5
- Departments covered: ${depts.join(', ') || 'none'}
- New hires (last 30 days): ${active.filter(e => e.created && (Date.now() - new Date(e.created)) < 30*86400000).length}`;
    },
    async act(analysis) {
      const actions = [];
      // Mark employees as onboarded if they've been active > 14 days
      const emps = HRStore.getEmployees();
      emps.filter(e => !e.onboarded && e.status === 'active' && e.created && (Date.now() - new Date(e.created)) > 14*86400000).forEach(e => {
        HRStore.updateEmployee(e.id, { onboarded: true });
        actions.push(`Auto-completed onboarding for ${e.name} (active 14+ days)`);
      });
      return actions;
    },
  },

  marketing: {
    name: 'Spark',
    title: 'Marketing & Growth Agent',
    emoji: '📣',
    color: '#fb923c',
    getDeptContext() {
      const camps = MarketingStore.getCampaigns();
      const content = MarketingStore.getContent();
      const active = camps.filter(c => c.status === 'active');
      const totalLeads = camps.reduce((s,c) => s+(c.leads||0),0);
      const drafts = content.filter(c => c.status === 'draft');
      return `Marketing Department Status:
- Campaigns: ${camps.length} total, ${active.length} active, ${camps.filter(c=>c.status==='completed').length} completed
- Pipeline: ${totalLeads} total leads
- Content: ${content.length} pieces (${drafts.length} drafts, ${content.filter(c=>c.status==='published').length} published)
- Active campaign channels: ${[...new Set(active.flatMap(c=>c.channels))].join(', ') || 'none'}
- Avg leads per campaign: ${camps.length ? (totalLeads/camps.length).toFixed(1) : 0}`;
    },
    async act(analysis) {
      const actions = [];
      const camps = MarketingStore.getCampaigns();
      camps.filter(c => c.status === 'active' && c.endDate && new Date(c.endDate) < new Date()).forEach(c => {
        MarketingStore.updateCampaign(c.id, { status: 'completed' });
        actions.push(`Auto-completed campaign "${c.name}" (past end date)`);
      });
      return actions;
    },
  },

  sales: {
    name: 'Chase',
    title: 'Sales & CRM Agent',
    emoji: '📈',
    color: '#fb923c',
    getDeptContext() {
      const pipeline = SalesStore.getPipeline();
      const deals = SalesStore.getDeals();
      const contacts = SalesStore.getContacts();
      const stale = deals.filter(d => {
        const days = Math.floor((Date.now() - new Date(d.updated || d.created)) / 86400000);
        return days >= 14 && !d.stage.startsWith('closed');
      });
      return `Sales Department Status:
- Pipeline: ${pipeline.totalOpen} open deals, $${pipeline.totalValue?.toLocaleString()} total, $${pipeline.weighted?.toLocaleString()} weighted
- Contacts: ${contacts.length} total
- Stale deals (14+ days no update): ${stale.length}
- By stage: ${Object.entries(pipeline.pipeline || {}).map(([s,v]) => `${s}:${v.count}`).join(', ')}`;
    },
    async act(analysis) {
      const actions = [];
      const deals = SalesStore.getDeals();
      // Flag deals with no activity for 30+ days
      deals.filter(d => {
        const days = Math.floor((Date.now() - new Date(d.updated || d.created)) / 86400000);
        return days >= 30 && !d.stage.startsWith('closed');
      }).slice(0, 3).forEach(d => {
        SalesStore.updateDeal(d.id, { notes: (d.notes || '') + `\n[Agent Chase: flagged stale ${new Date().toLocaleDateString()}]` });
        actions.push(`Flagged stale deal "${d.title}" (30+ days inactive)`);
      });
      return actions;
    },
  },

  legal: {
    name: 'Counsel',
    title: 'Legal & Compliance Agent',
    emoji: '⚖️',
    color: '#94a3b8',
    getDeptContext() {
      const contracts = LegalStore.getContracts();
      const risks = LegalStore.getRisks();
      const expiringSoon = contracts.filter(c => {
        if (!c.endDate || c.status !== 'active') return false;
        return Math.floor((new Date(c.endDate) - Date.now()) / 86400000) <= 30;
      });
      const highRisks = risks.filter(r => r.severity === 'high' || r.severity === 'critical');
      return `Legal Department Status:
- Contracts: ${contracts.length} total, ${contracts.filter(c=>c.status==='active').length} active, ${contracts.filter(c=>c.status==='pending').length} pending
- Expiring in 30 days: ${expiringSoon.map(c=>c.name).join(', ') || 'none'}
- Risk register: ${risks.length} items, ${highRisks.length} high/critical severity`;
    },
    async act(analysis) {
      const actions = [];
      const contracts = LegalStore.getContracts();
      contracts.filter(c => c.status === 'active' && c.endDate && new Date(c.endDate) < new Date()).forEach(c => {
        LegalStore.updateContract(c.id, { status: 'expired' });
        actions.push(`Auto-expired contract "${c.name}" (past end date)`);
      });
      return actions;
    },
  },
};

// ── Council orchestrator ───────────────────────────────────────────
export async function runCouncilCycle() {
  if (!process.env.ANTHROPIC_API_KEY) {
    postToFeed({ type: 'system', message: 'Council paused: ANTHROPIC_API_KEY not set', emoji: '⚠️' });
    return;
  }

  const state = readState();
  if (state.running) return; // Prevent concurrent runs

  writeState({ running: true, lastRun: new Date().toISOString(), cycleCount: (state.cycleCount || 0) + 1 });
  const cycleNum = (state.cycleCount || 0) + 1;

  postToFeed({ type: 'system', message: `Council cycle #${cycleNum} started — all agents activating`, emoji: '🔄', cycleNum });

  try {
    const agentOutputs = {};
    const crossDeptContext = {};

    // Round 1: Each agent reviews its dept and produces analysis
    for (const [key, agent] of Object.entries(AGENTS)) {
      const deptCtx = agent.getDeptContext();

      postToFeed({
        type: 'agent-thinking',
        agent: key,
        agentName: agent.name,
        agentTitle: agent.title,
        emoji: agent.emoji,
        color: agent.color,
        message: `Analysing ${agent.title.split(' ')[0]} department data…`,
      });

      const stores = { ITStore, FinanceStore, HRStore, MarketingStore, SalesStore, LegalStore, OpsStore };
      const goalCtx = buildGoalContext(key, stores);

      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `You are ${agent.name}, the autonomous ${agent.title} for this company.
You monitor your department 24/7, take proactive actions, and work toward your assigned goals.
Be concise (3-5 sentences). Identify the most important issue or opportunity right now.
Report on goal progress — celebrate wins, flag anything off-track.
If another department needs to know something, say "→ [DeptName]: [message]".`,
        messages: [{ role: 'user', content: `Your department status:\n${deptCtx}\n${goalCtx}\n\nWhat's your status update, goal progress, and any cross-department flags?` }],
      });

      const analysis = res.content[0]?.text || '';
      agentOutputs[key] = { agent, analysis, deptCtx };

      // Check for cross-dept signals
      if (key === 'finance' && analysis.toLowerCase().includes('budget') && analysis.toLowerCase().includes('risk')) {
        crossDeptContext.financeAlert = true;
      }

      postToFeed({
        type: 'agent-update',
        agent: key,
        agentName: agent.name,
        agentTitle: agent.title,
        emoji: agent.emoji,
        color: agent.color,
        message: analysis,
      });

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 800));
    }

    // Round 2: Agents take autonomous actions
    postToFeed({ type: 'system', message: 'Taking autonomous actions…', emoji: '⚡' });

    for (const [key, { agent, analysis }] of Object.entries(agentOutputs)) {
      try {
        const result = await agent.act(analysis, crossDeptContext);
        const actions = Array.isArray(result) ? result : (result?.actions || []);
        if (result?.alert) crossDeptContext.financeAlert = true;

        if (actions.length > 0) {
          postToFeed({
            type: 'agent-action',
            agent: key,
            agentName: agent.name,
            agentTitle: agent.title,
            emoji: agent.emoji,
            color: agent.color,
            message: `**Actions taken:**\n${actions.map(a => `• ${a}`).join('\n')}`,
            actions,
          });
        }
      } catch (err) {
        postToFeed({ type: 'error', agent: key, message: `Action error: ${err.message}`, emoji: '⚠️' });
      }
    }

    // Round 3: Cross-agent synthesis — agents respond to each other
    const allUpdates = Object.values(agentOutputs).map(o => `${o.agent.emoji} ${o.agent.name} (${o.agent.title}):\n${o.analysis}`).join('\n\n');

    postToFeed({ type: 'system', message: 'Agents reviewing each other\'s updates…', emoji: '🤝' });

    const synthesisRes = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `You are the AI Council Moderator. You synthesise updates from all department agents and identify:
1. Cross-department conflicts or dependencies that need resolving
2. The single most important company-wide priority right now
3. Any recommended War Room thread to open
Be direct, max 4 bullet points.`,
      messages: [{ role: 'user', content: `Agent updates this cycle:\n\n${allUpdates}\n\nWhat are the key cross-department insights?` }],
    });

    const synthesis = synthesisRes.content[0]?.text || '';
    postToFeed({
      type: 'synthesis',
      emoji: '🧠',
      agentName: 'Council AI',
      agentTitle: 'Cross-Department Synthesis',
      message: synthesis,
    });

    // Auto-open War Room thread if synthesis flags urgency
    if (synthesis.toLowerCase().includes('urgent') || synthesis.toLowerCase().includes('critical') || synthesis.toLowerCase().includes('war room')) {
      const existing = WarRoomStore.getThreads().find(t => t.subject.includes('Agent Council'));
      if (!existing) {
        WarRoomStore.addThread({
          subject: `Agent Council Alert — Cycle #${cycleNum}`,
          from: '🤖 Agent Council',
          to: 'all',
          body: synthesis,
          priority: 'high',
        });
        postToFeed({ type: 'system', message: 'Opened War Room thread for cross-dept coordination', emoji: '💬' });
      }
    }

    // Round 4: Evaluate goals and run any auto-approved queued actions
    const stores = { ITStore, FinanceStore, HRStore, MarketingStore, SalesStore, LegalStore, OpsStore };
    const goalEval = evaluateGoals(stores);
    const offTrack = goalEval.filter(g => g.status === 'off_track' || g.status === 'critical');
    const onTrack  = goalEval.filter(g => g.status === 'on_track');
    if (goalEval.length > 0) {
      postToFeed({
        type: 'goals',
        emoji: '🎯',
        agentName: 'Goal Tracker',
        message: `Goals evaluated: ${onTrack.length}/${goalEval.length} on track.\n${offTrack.length > 0 ? `Off-track: ${offTrack.map(g => `${g.label} (${g.current} vs target ${g.direction} ${g.target})`).join('; ')}` : '✅ All goals on track!'}`,
        goals: { onTrack: onTrack.length, offTrack: offTrack.length, total: goalEval.length },
      });
    }

    // Execute auto-approved actions that were queued this cycle
    await runAutoApproved();

    postToFeed({ type: 'system', message: `Cycle #${cycleNum} complete. All agents standing by.`, emoji: '✅', cycleNum });

  } catch (err) {
    postToFeed({ type: 'error', message: `Council cycle failed: ${err.message}`, emoji: '❌' });
  } finally {
    writeState({ running: false });
  }
}

// ── Schedule management ────────────────────────────────────────────
let _councilTimer = null;

export function getCouncilState() { return readState(); }
export function getCouncilFeed(limit = 100) { return readFeed().slice(0, limit); }

export function startCouncil({ intervalMs = 3600000 } = {}) {
  stopCouncil();
  writeState({ enabled: true, intervalMs, nextRun: new Date(Date.now() + intervalMs).toISOString() });
  postToFeed({ type: 'system', message: `Agent Council activated — running every ${Math.round(intervalMs/60000)} minutes`, emoji: '🚀' });
  _councilTimer = setInterval(async () => {
    writeState({ nextRun: new Date(Date.now() + intervalMs).toISOString() });
    await runCouncilCycle();
  }, intervalMs);
  return readState();
}

export function stopCouncil() {
  if (_councilTimer) { clearInterval(_councilTimer); _councilTimer = null; }
  writeState({ enabled: false, nextRun: null });
  return readState();
}

export function triggerCouncilNow() {
  setImmediate(runCouncilCycle);
  return { ok: true, message: 'Council cycle triggered' };
}
