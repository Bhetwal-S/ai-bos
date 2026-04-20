// index.js
// Entry point — Express server serving the CEO dashboard with SSE streaming

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws'; // npm install ws
import { runPipeline } from './orchestrator/pipeline.js';
import MemoryStore from './memory/store.js';
import { query as chiefQuery, surfacePatterns } from './chief-ai/index.js';
import { chat, getChatHistory, clearChatSession } from './chief-ai/chat.js';
import { addSchedule, removeSchedule, toggleSchedule, getSchedules, startScheduler, INTERVALS } from './orchestrator/scheduler.js';
import { PLAYBOOKS } from './config/playbooks.js';
import { KnowledgeStore, WorkspaceRegistry } from './chief-ai/knowledge-store.js';
import { AuthStore, requireAuth, InviteStore, DeptRoleStore, requireDeptRole } from './auth/auth.js';
import { ITStore, FinanceStore, HRStore, MarketingStore, WarRoomStore, SalesStore, LegalStore, OpsStore, SettingsStore } from './departments/store.js';
import { startCouncil, stopCouncil, triggerCouncilNow, getCouncilState, getCouncilFeed, runCouncilCycle } from './agent-council/council.js';
import { initTriggers, fireTrigger, startScheduledChecks, getCustomTriggers, saveCustomTrigger, deleteCustomTrigger, TRIGGER_RULES } from './agent-council/triggers.js';
import { getQueue, getLog, approveAction, rejectAction, queueAction } from './agent-council/actions.js';
import { getGoals, updateGoal, evaluateGoals, getGoalHistory } from './agent-council/goals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'ui')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'ui', 'landing.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'ui', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'ui', 'index.html')));

// ── Auth routes (public) ───────────────────────────────────────────
app.get('/api/auth/status', (req, res) => res.json({ hasUsers: AuthStore.hasUsers() }));

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, inviteToken } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  // If users already exist, an invite token is required
  if (AuthStore.hasUsers() && !inviteToken)
    return res.status(403).json({ error: 'An invite link is required to register' });

  let workspaceId = 'default';
  if (inviteToken) {
    try {
      const invite = InviteStore.validate(inviteToken);
      if (invite.email && invite.email !== email.toLowerCase().trim())
        return res.status(403).json({ error: 'This invite was sent to a different email address' });
      workspaceId = invite.workspaceId || 'default';
      InviteStore.consume(inviteToken);
    } catch (err) { return res.status(400).json({ error: err.message }); }
  }

  try {
    const user = await AuthStore.register({ email, password, name, workspaceId });
    const { token } = await AuthStore.login({ email, password });
    res.json({ ok: true, token, user });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Invite validation (public — no auth needed) ────────────────────
app.get('/api/auth/invite/:token', (req, res) => {
  try {
    const invite = InviteStore.validate(req.params.token);
    res.json({ ok: true, email: invite.email, workspaceId: invite.workspaceId });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const result = await AuthStore.login({ email, password });
    res.json(result);
  } catch (err) { res.status(401).json({ error: err.message }); }
});

// ── Auth middleware — all /api routes below require a valid token ──
app.use('/api', requireAuth);

// ── Workspace middleware — resolves KnowledgeStore per request ─────
app.use((req, res, next) => {
  const wsId = req.headers['x-workspace-id'] || 'default';
  req.ws = KnowledgeStore.for(wsId);
  req.wsId = wsId;
  next();
});

// ── Team & Invite API (protected) ─────────────────────────────────
app.get('/api/team', (req, res) => {
  res.json({ users: AuthStore.getUsers(), invites: InviteStore.getAll() });
});

app.post('/api/invites', (req, res) => {
  const { email, workspaceId } = req.body;
  const invite = InviteStore.create({
    email: email || null,
    workspaceId: workspaceId || req.wsId || 'default',
    createdBy: req.user?.email,
  });
  const link = `${req.protocol}://${req.get('host')}/login?invite=${invite.token}`;
  res.json({ ok: true, invite, link });
});

app.delete('/api/invites/:token', (req, res) => {
  InviteStore.revoke(req.params.token);
  res.json({ ok: true });
});

// ── Dept Role API ──────────────────────────────────────────────────
app.get('/api/dept-roles', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const roles = DeptRoleStore.getAll();
  const users = AuthStore.getUsers();
  res.json({ roles, users });
});

app.put('/api/dept-roles/:userId', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { dept, role } = req.body;
  if (!dept) return res.status(400).json({ error: 'dept required' });
  DeptRoleStore.setRole(req.params.userId, dept, role || null);
  res.json({ ok: true });
});

app.get('/api/my-roles', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorised' });
  if (req.user.role === 'admin') return res.json({ admin: true, depts: ['it','finance','hr','marketing'] });
  res.json({ admin: false, depts: Object.keys(DeptRoleStore.getUserRoles(req.user.id)) });
});

app.delete('/api/team/:id', (req, res) => {
  if (req.user?.id === req.params.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });
  AuthStore.deleteUser(req.params.id);
  res.json({ ok: true });
});

// ── Workspaces API ─────────────────────────────────────────────────
app.get('/api/workspaces', (req, res) => res.json(WorkspaceRegistry.getAll()));

app.post('/api/workspaces', (req, res) => {
  const { name, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  try { res.json(WorkspaceRegistry.create({ name: name.trim(), color })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/workspaces/:id', (req, res) => {
  try { WorkspaceRegistry.delete(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Shared SSE pipeline handler ────────────────────────────────────────────
async function handlePipelineRequest(req, res, options = {}) {
  const command = req.query.cmd;
  if (!command) return res.status(400).json({ error: 'No command provided' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const result = await runPipeline(command, (event) => send(event), { ...options, workspace: req.ws });
    send({ type: 'complete', result });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }
  res.end();
}

// ── CEO Command endpoint (Server-Sent Events for real-time streaming) ──────
app.get('/api/command', (req, res) => handlePipelineRequest(req, res));
app.get('/api/command/whatif', (req, res) => handlePipelineRequest(req, res, { whatIf: true }));

// ── Memory API ─────────────────────────────────────────────────────────────
app.get('/api/memory', (req, res) => {
  const { type, n = 20 } = req.query;
  res.json(MemoryStore.getRecent(parseInt(n), type || null));
});

app.get('/api/memory/stats', (req, res) => {
  res.json({
    total: MemoryStore.count(),
    decisions: MemoryStore.getAll('decision').length,
    projects: MemoryStore.getAll('project').length,
    contradictions: MemoryStore.getAll('contradiction').length,
    constraints: MemoryStore.getAll('constraint').length,
  });
});

app.delete('/api/memory', (req, res) => {
  MemoryStore.clear();
  res.json({ ok: true, message: 'Memory cleared' });
});

// ── Chief AI API ───────────────────────────────────────────────────────────
app.get('/api/chief/query', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'No question provided' });
  try {
    const answer = await chiefQuery(q);
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/chief/persona', (req, res) => {
  const { persona } = req.body;
  if (!['aggressive', 'balanced', 'conservative'].includes(persona))
    return res.status(400).json({ error: 'Invalid persona. Use: aggressive, balanced, conservative' });
  const updated = req.ws.updateProfile({ persona });
  res.json({ ok: true, persona: updated.persona });
});

app.patch('/api/chief/profile', (req, res) => {
  try {
    const updated = req.ws.updateProfile(req.body);
    res.json({ ok: true, profile: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chief/patterns', async (req, res) => {
  try {
    const result = await surfacePatterns();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chief/knowledge', (req, res) => {
  res.json({
    profile:   req.ws.getProfile(),
    decisions: req.ws.getDecisions(20),
    lessons:   req.ws.getLessons(20),
    projects:  req.ws.getProjects(10),
  });
});

// ── CEO Chat API ───────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!message) return res.status(400).json({ error: 'No message provided' });
  try {
    const result = await chat(sessionId || 'default', message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chat/history', (req, res) => {
  const { sessionId = 'default' } = req.query;
  res.json(getChatHistory(sessionId));
});

app.delete('/api/chat', (req, res) => {
  const { sessionId = 'default' } = req.query;
  clearChatSession(sessionId);
  res.json({ ok: true });
});

// ── Scheduler API ──────────────────────────────────────────────────────────
app.get('/api/schedules', (req, res) => {
  res.json({ schedules: getSchedules(), intervals: INTERVALS });
});

app.post('/api/schedules', (req, res) => {
  const { command, interval, description } = req.body;
  if (!command || !interval) return res.status(400).json({ error: 'command and interval required' });
  const preset = INTERVALS[interval];
  if (!preset) return res.status(400).json({ error: `Invalid interval. Use: ${Object.keys(INTERVALS).join(', ')}` });
  const schedule = addSchedule({ command, cronLabel: preset.label, intervalMs: preset.ms, description });
  res.json({ ok: true, schedule });
});

app.delete('/api/schedules/:id', (req, res) => {
  removeSchedule(req.params.id);
  res.json({ ok: true });
});

app.patch('/api/schedules/:id', (req, res) => {
  const { enabled } = req.body;
  toggleSchedule(req.params.id, enabled);
  res.json({ ok: true });
});

// ── Projects API ──────────────────────────────────────────────────
app.get('/api/projects', (req, res) => res.json(req.ws.getProjects()));

app.post('/api/projects', (req, res) => {
  const { command, title, notes } = req.body;
  if (!command) return res.status(400).json({ error: 'command required' });
  const proj = req.ws.upsertProject(command, '');
  if (title) req.ws.updateProject(proj.id, { title, notes: notes || '' });
  res.json(req.ws.getProject(proj.id));
});

app.patch('/api/projects/:id', (req, res) => {
  const updated = req.ws.updateProject(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

app.delete('/api/projects/:id', (req, res) => { req.ws.deleteProject(req.params.id); res.json({ ok: true }); });

app.post('/api/projects/:id/milestones', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const proj = req.ws.addMilestone(req.params.id, text);
  if (!proj) return res.status(404).json({ error: 'Not found' });
  res.json(proj);
});

app.patch('/api/projects/:id/milestones/:mid', (req, res) => {
  const proj = req.ws.toggleMilestone(req.params.id, req.params.mid);
  if (!proj) return res.status(404).json({ error: 'Not found' });
  res.json(proj);
});

// ── Agent Performance API ──────────────────────────────────────────
app.get('/api/agent-performance', (req, res) => res.json(req.ws.getAgentPerformance()));

// ── Command History API ────────────────────────────────────────────
app.get('/api/history', (req, res) => {
  const { limit = 50, search = '' } = req.query;
  res.json(req.ws.getHistory({ limit: parseInt(limit), search }));
});

app.delete('/api/history/:id', (req, res) => {
  const history = req.ws.getHistory({ limit: 200 });
  req.ws._writeHistory(history.filter(h => h.id !== req.params.id));
  res.json({ ok: true });
});

// ── Playbooks API ─────────────────────────────────────────────────
app.get('/api/playbooks', (req, res) => res.json(PLAYBOOKS));

// ── Analytics API ─────────────────────────────────────────────────
app.get('/api/analytics', (req, res) => {
  const allMemory   = MemoryStore.getAll();
  const decisions   = MemoryStore.getAll('decision');
  const outcomes    = MemoryStore.getAll('outcome');
  const contradictions = MemoryStore.getAll('contradiction');
  const projects    = req.ws.getProjects(50);
  const lessons     = req.ws.getLessons(50);

  // Agent activity counts from outcome records
  const agentCounts = {};
  outcomes.forEach(r => {
    const agent = r.agent_source;
    agentCounts[agent] = (agentCounts[agent] || 0) + 1;
  });

  // Decisions per day (last 14 days)
  const now = Date.now();
  const decisionsByDay = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    decisionsByDay[d.toISOString().slice(0, 10)] = 0;
  }
  decisions.forEach(r => {
    const day = r.timestamp?.slice(0, 10);
    if (day && decisionsByDay[day] !== undefined) decisionsByDay[day]++;
  });

  // Project status breakdown
  const statusCounts = { planning: 0, 'in-progress': 0, blocked: 0, done: 0 };
  projects.forEach(p => { if (statusCounts[p.status] !== undefined) statusCounts[p.status]++; });

  // Lessons by category
  const lessonsByCategory = {};
  lessons.forEach(l => {
    lessonsByCategory[l.category] = (lessonsByCategory[l.category] || 0) + 1;
  });

  res.json({
    totals: {
      memory: allMemory.length,
      decisions: decisions.length,
      outcomes: outcomes.length,
      contradictions: contradictions.length,
      projects: projects.length,
      lessons: lessons.length,
    },
    agentCounts,
    decisionsByDay,
    statusCounts,
    lessonsByCategory,
    recentDecisions: decisions.slice(-5).reverse(),
  });
});

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => res.json({ status: 'ok', ts: Date.now() }));
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    apiKey: !!process.env.ANTHROPIC_API_KEY,
    memoryRecords: MemoryStore.count(),
    timestamp: new Date().toISOString(),
  });
});

// ── Department pages ───────────────────────────────────────────────
['it','finance','hr','marketing','sales'].forEach(dept => {
  app.get(`/department/${dept}`, (req, res) =>
    res.sendFile(path.join(__dirname, 'ui', 'departments', `${dept}.html`)));
});
app.get('/agent-council', (req, res) =>
  res.sendFile(path.join(__dirname, 'ui', 'agent-council.html')));
app.get('/war-room', (req, res) =>
  res.sendFile(path.join(__dirname, 'ui', 'war-room.html')));
app.get('/identity-hub', (req, res) =>
  res.sendFile(path.join(__dirname, 'ui', 'identity-hub.html')));
app.get('/company-hub', (req, res) =>
  res.sendFile(path.join(__dirname, 'ui', 'company-hub.html')));
app.get('/department/legal', (req, res) => res.sendFile(path.join(__dirname, 'ui', 'departments', 'legal.html')));
app.get('/department/operations', (req, res) => res.sendFile(path.join(__dirname, 'ui', 'departments', 'operations.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__dirname, 'ui', 'settings.html')));
app.get('/approval-queue', (req, res) => res.sendFile(path.join(__dirname, 'ui', 'approval-queue.html')));
app.get('/goals', (req, res) => res.sendFile(path.join(__dirname, 'ui', 'goals.html')));
app.get('/analytics', (req, res) => res.sendFile(path.join(__dirname, 'ui', 'analytics.html')));

// helper — broadcast if ws is ready
function ws(event, data) { if (global.aibosWsBroadcast) global.aibosWsBroadcast(event, data); }

// ── IT API ─────────────────────────────────────────────────────────
app.get('/api/it/tickets', (req, res) => res.json(ITStore.getTickets()));
app.post('/api/it/tickets', (req, res) => { const t = ITStore.addTicket(req.body); ws('ticket:created', t); res.json(t); });
app.patch('/api/it/tickets/:id', (req, res) => {
  const t = ITStore.updateTicket(req.params.id, req.body);
  if (t) { ws('ticket:updated', t); res.json(t); } else res.status(404).json({ error: 'Not found' });
});
app.delete('/api/it/tickets/:id', (req, res) => { ITStore.deleteTicket(req.params.id); ws('ticket:deleted', { id: req.params.id }); res.json({ ok: true }); });
app.get('/api/it/registry', (req, res) => res.json(ITStore.getRegistry()));
app.post('/api/it/registry', (req, res) => res.json(ITStore.addAgent(req.body)));
app.patch('/api/it/registry/:id', (req, res) => res.json(ITStore.updateAgent(req.params.id, req.body)));

// ── Finance API ────────────────────────────────────────────────────
app.get('/api/finance/ledger', (req, res) => res.json(FinanceStore.getLedger()));
app.post('/api/finance/ledger', (req, res) => res.json(FinanceStore.addEntry(req.body)));
app.delete('/api/finance/ledger/:id', (req, res) => { FinanceStore.deleteEntry(req.params.id); res.json({ ok: true }); });
app.get('/api/finance/summary', (req, res) => res.json(FinanceStore.getSummary()));
app.get('/api/finance/invoices', (req, res) => res.json(FinanceStore.getInvoices()));
app.post('/api/finance/invoices', (req, res) => res.json(FinanceStore.addInvoice(req.body)));
app.patch('/api/finance/invoices/:id', (req, res) => res.json(FinanceStore.updateInvoice(req.params.id, req.body)));

// ── HR API ─────────────────────────────────────────────────────────
app.get('/api/hr/employees', (req, res) => res.json(HRStore.getEmployees()));
app.post('/api/hr/employees', (req, res) => res.json(HRStore.addEmployee(req.body)));
app.patch('/api/hr/employees/:id', (req, res) => {
  const e = HRStore.updateEmployee(req.params.id, req.body);
  e ? res.json(e) : res.status(404).json({ error: 'Not found' });
});
app.delete('/api/hr/employees/:id', (req, res) => { HRStore.deleteEmployee(req.params.id); res.json({ ok: true }); });
app.get('/api/hr/performance', (req, res) => res.json(HRStore.getPerformance()));
app.post('/api/hr/performance', (req, res) => res.json(HRStore.addReview(req.body)));

// ── Marketing API ──────────────────────────────────────────────────
app.get('/api/marketing/content', (req, res) => res.json(MarketingStore.getContent()));
app.post('/api/marketing/content', (req, res) => res.json(MarketingStore.addContent(req.body)));
app.patch('/api/marketing/content/:id', (req, res) => res.json(MarketingStore.updateContent(req.params.id, req.body)));
app.delete('/api/marketing/content/:id', (req, res) => { MarketingStore.deleteContent(req.params.id); res.json({ ok: true }); });
app.get('/api/marketing/campaigns', (req, res) => res.json(MarketingStore.getCampaigns()));
app.post('/api/marketing/campaigns', (req, res) => res.json(MarketingStore.addCampaign(req.body)));
app.patch('/api/marketing/campaigns/:id', (req, res) => res.json(MarketingStore.updateCampaign(req.params.id, req.body)));

// ── War Room API ───────────────────────────────────────────────────
app.get('/api/war-room/threads', (req, res) => res.json(WarRoomStore.getThreads()));
app.post('/api/war-room/threads', (req, res) => {
  const { subject, from, to, body, priority } = req.body;
  if (!subject || !from || !body) return res.status(400).json({ error: 'subject, from, body required' });
  res.json(WarRoomStore.addThread({ subject, from, to, body, priority }));
});
app.post('/api/war-room/threads/:id/messages', (req, res) => {
  const { from, body, type } = req.body;
  const thread = WarRoomStore.addMessage(req.params.id, { from, body, type });
  thread ? res.json(thread) : res.status(404).json({ error: 'Thread not found' });
});
app.delete('/api/war-room/threads/:id', (req, res) => { WarRoomStore.deleteThread(req.params.id); res.json({ ok: true }); });

app.post('/api/war-room/threads/:id/ai', async (req, res) => {
  const thread = WarRoomStore.getThreads().find(t => t.id === req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const history = thread.messages.map(m => ({
    role: m.type === 'ai' ? 'assistant' : 'user',
    content: `[${m.from}]: ${m.body}`,
  }));

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You are an AI executive assistant in the War Room — a cross-department command center.
Thread subject: "${thread.subject}" (${thread.from} → ${thread.to}).
Give a concise, actionable response. Be direct. Reference specific departments when relevant.`,
      messages: history.length ? history : [{ role: 'user', content: `Please analyze: ${thread.subject}` }],
    });
    const aiBody = response.content[0]?.text || 'No response.';
    const updated = WarRoomStore.addMessage(req.params.id, { from: '🤖 AI Executive', body: aiBody, type: 'ai' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sales & CRM API ───────────────────────────────────────────────
app.get('/api/sales/contacts', (req, res) => res.json(SalesStore.getContacts()));
app.post('/api/sales/contacts', (req, res) => res.json(SalesStore.addContact(req.body)));
app.patch('/api/sales/contacts/:id', (req, res) => res.json(SalesStore.updateContact(req.params.id, req.body)));
app.delete('/api/sales/contacts/:id', (req, res) => { SalesStore.deleteContact(req.params.id); res.json({ ok: true }); });
app.get('/api/sales/deals', (req, res) => res.json(SalesStore.getDeals()));
app.post('/api/sales/deals', (req, res) => res.json(SalesStore.addDeal(req.body)));
app.patch('/api/sales/deals/:id', (req, res) => {
  const d = SalesStore.updateDeal(req.params.id, req.body);
  d ? res.json(d) : res.status(404).json({ error: 'Not found' });
});
app.delete('/api/sales/deals/:id', (req, res) => { SalesStore.deleteDeal(req.params.id); res.json({ ok: true }); });
app.get('/api/sales/pipeline', (req, res) => res.json(SalesStore.getPipeline()));

// ── Legal API ──────────────────────────────────────────────────────
app.get('/api/legal/contracts', (req, res) => res.json(LegalStore.getContracts()));
app.post('/api/legal/contracts', (req, res) => res.json(LegalStore.addContract(req.body)));
app.patch('/api/legal/contracts/:id', (req, res) => {
  const c = LegalStore.updateContract(req.params.id, req.body);
  c ? res.json(c) : res.status(404).json({ error: 'Not found' });
});
app.delete('/api/legal/contracts/:id', (req, res) => { LegalStore.deleteContract(req.params.id); res.json({ ok: true }); });
app.get('/api/legal/risks', (req, res) => res.json(LegalStore.getRisks()));
app.post('/api/legal/risks', (req, res) => res.json(LegalStore.addRisk(req.body)));
app.delete('/api/legal/risks/:id', (req, res) => { LegalStore.deleteRisk(req.params.id); res.json({ ok: true }); });

// ── Operations API ─────────────────────────────────────────────────
app.get('/api/ops/projects', (req, res) => res.json(OpsStore.getProjects()));
app.post('/api/ops/projects', (req, res) => res.json(OpsStore.addProject(req.body)));
app.patch('/api/ops/projects/:id', (req, res) => {
  const p = OpsStore.updateProject(req.params.id, req.body);
  p ? res.json(p) : res.status(404).json({ error: 'Not found' });
});
app.get('/api/ops/tasks', (req, res) => res.json(OpsStore.getTasks()));
app.post('/api/ops/tasks', (req, res) => res.json(OpsStore.addTask(req.body)));
app.patch('/api/ops/tasks/:id', (req, res) => {
  const t = OpsStore.updateTask(req.params.id, req.body);
  t ? res.json(t) : res.status(404).json({ error: 'Not found' });
});
app.delete('/api/ops/tasks/:id', (req, res) => { OpsStore.deleteTask(req.params.id); res.json({ ok: true }); });
app.get('/api/ops/okrs', (req, res) => res.json(OpsStore.getOKRs()));
app.post('/api/ops/okrs', (req, res) => res.json(OpsStore.addOKR(req.body)));
app.patch('/api/ops/okrs/:id', (req, res) => {
  const o = OpsStore.updateOKR(req.params.id, req.body);
  o ? res.json(o) : res.status(404).json({ error: 'Not found' });
});
app.delete('/api/ops/okrs/:id', (req, res) => { OpsStore.deleteOKR(req.params.id); res.json({ ok: true }); });

// ── Action Queue API ───────────────────────────────────────────────
app.get('/api/actions/queue', requireAuth, (req, res) => res.json(getQueue()));
app.get('/api/actions/log',   requireAuth, (req, res) => res.json(getLog(parseInt(req.query.limit) || 100)));
app.post('/api/actions/:id/approve', requireAuth, async (req, res) => {
  const result = await approveAction(req.params.id);
  res.json(result);
});
app.post('/api/actions/:id/reject', requireAuth, (req, res) => {
  const result = rejectAction(req.params.id, req.body.reason || '');
  res.json(result);
});

// ── Goals API ──────────────────────────────────────────────────────
app.get('/api/goals', requireAuth, (req, res) => res.json(getGoals()));
app.patch('/api/goals/:agentKey/:goalId', requireAuth, (req, res) => {
  const result = updateGoal(req.params.agentKey, req.params.goalId, req.body);
  result ? res.json(result) : res.status(404).json({ error: 'Not found' });
});
app.get('/api/goals/evaluate', requireAuth, (req, res) => {
  const result = evaluateGoals({ ITStore, FinanceStore, HRStore, MarketingStore, SalesStore, LegalStore, OpsStore });
  res.json(result);
});
app.get('/api/goals/history', requireAuth, (req, res) => res.json(getGoalHistory(parseInt(req.query.limit) || 30)));

// ── Triggers API ───────────────────────────────────────────────────
app.get('/api/triggers', requireAuth, (req, res) => res.json({ builtin: TRIGGER_RULES, custom: getCustomTriggers() }));
app.post('/api/triggers', requireAuth, (req, res) => res.json(saveCustomTrigger(req.body)));
app.delete('/api/triggers/:id', requireAuth, (req, res) => { deleteCustomTrigger(req.params.id); res.json({ ok: true }); });

// ── Settings API ───────────────────────────────────────────────────
app.get('/api/settings', requireAuth, (req, res) => res.json(SettingsStore.get()));
app.patch('/api/settings', requireAuth, (req, res) => res.json(SettingsStore.set(req.body)));

// ── Slack Webhook API ──────────────────────────────────────────────
app.post('/api/settings/test-slack', requireAuth, async (req, res) => {
  const settings = SettingsStore.get();
  const webhookUrl = settings.slackWebhookUrl;
  if (!webhookUrl) return res.status(400).json({ error: 'No Slack webhook URL configured' });
  try {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '✅ AI-BOS Slack integration is working! Your business OS is connected.' }),
    });
    if (!r.ok) return res.status(500).json({ error: `Slack returned ${r.status}` });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CSV Import API ─────────────────────────────────────────────────
app.post('/api/import/employees', requireAuth, (req, res) => {
  const { rows } = req.body; // array of {name,email,role,department,manager,startDate}
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows array required' });
  const results = rows.filter(r => r.name && r.role).map(r => HRStore.addEmployee(r));
  res.json({ imported: results.length, skipped: rows.length - results.length });
});
app.post('/api/import/contacts', requireAuth, (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows array required' });
  const results = rows.filter(r => r.name).map(r => SalesStore.addContact(r));
  res.json({ imported: results.length });
});
app.post('/api/import/ledger', requireAuth, (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows array required' });
  const results = rows.filter(r => r.description && r.amount).map(r => FinanceStore.addEntry(r));
  res.json({ imported: results.length });
});

// ── Agent Council API ─────────────────────────────────────────────
app.get('/api/council/state', (req, res) => res.json(getCouncilState()));
app.get('/api/council/feed', (req, res) => res.json(getCouncilFeed(parseInt(req.query.limit) || 100)));
app.post('/api/council/start', (req, res) => {
  const { intervalMs = 3600000 } = req.body;
  res.json(startCouncil({ intervalMs }));
});
app.post('/api/council/stop', (req, res) => res.json(stopCouncil()));
app.post('/api/council/trigger', (req, res) => res.json(triggerCouncilNow()));

// ── Weekly AI Report ──────────────────────────────────────────────
app.get('/api/report/weekly', async (req, res) => {
  try {
    const tickets = ITStore.getTickets();
    const finSum  = FinanceStore.getSummary();
    const invoices= FinanceStore.getInvoices();
    const emps    = HRStore.getEmployees();
    const perf    = HRStore.getPerformance();
    const camps   = MarketingStore.getCampaigns();
    const deals   = SalesStore.getDeals();
    const pipeline= SalesStore.getPipeline();

    const context = `
WEEKLY BUSINESS REPORT DATA:

IT & DevOps:
- Tickets: ${tickets.length} total, ${tickets.filter(t=>t.status==='open').length} open, ${tickets.filter(t=>t.priority==='critical').length} critical
- Closed this period: ${tickets.filter(t=>t.status==='closed').length}

Finance:
- Revenue: $${finSum.revenue.toLocaleString()}, Expenses: $${finSum.expenses.toLocaleString()}, Net: $${finSum.net.toLocaleString()}
- Invoices: ${invoices.length} total, ${invoices.filter(i=>i.status==='overdue').length} overdue
- Top spend categories: ${Object.entries(finSum.byCategory||{}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k} ($${v.toLocaleString()})`).join(', ')}

HR:
- Headcount: ${emps.filter(e=>e.status==='active').length} active, ${emps.filter(e=>!e.onboarded&&e.status==='active').length} need onboarding
- Performance reviews logged: ${perf.length}

Marketing:
- Campaigns: ${camps.filter(c=>c.status==='active').length} active, ${camps.reduce((s,c)=>s+(c.leads||0),0)} total leads

Sales:
- Pipeline: ${pipeline.totalOpen} open deals, $${pipeline.totalValue.toLocaleString()} total value, $${pipeline.weighted.toLocaleString()} weighted
- Deals by stage: ${['prospecting','qualification','proposal','negotiation'].map(s=>`${s}: ${pipeline.pipeline[s]?.count||0}`).join(', ')}
`;

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: `You are the AI Chief of Staff generating a weekly executive briefing.
Write a concise, professional weekly report with these sections:
## Executive Summary (2-3 sentences, the single most important thing)
## Department Highlights (bullet points per dept — only noteworthy items)
## Risks & Watch Items (max 3 items that need CEO attention)
## Wins This Week (celebrate what's going well)
## Recommended Focus Next Week (1-2 priorities)
Be specific with numbers. Be honest about risks. Keep it under 500 words.`,
      messages: [{ role: 'user', content: context }],
    });

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      report: response.content[0]?.text || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Activity Feed API ─────────────────────────────────────────────
app.get('/api/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const events = [];

  ITStore.getTickets().forEach(t => {
    events.push({ id: t.id, dept: 'IT', icon: '🎫', type: 'ticket', title: `Ticket ${t.id}: ${t.title}`, meta: `${t.priority} · ${t.status}`, ts: t.updated || t.created });
  });
  ITStore.getRegistry().forEach(a => {
    events.push({ id: a.id, dept: 'IT', icon: '🤖', type: 'agent', title: `Agent registered: ${a.name}`, meta: a.role, ts: a.provisioned });
  });
  FinanceStore.getLedger().forEach(e => {
    const sign = e.type === 'revenue' ? '+' : '-';
    events.push({ id: e.id, dept: 'Finance', icon: e.type === 'revenue' ? '💚' : '💸', type: 'ledger', title: `${e.type === 'revenue' ? 'Revenue' : 'Expense'}: ${e.description}`, meta: `${sign}$${Math.abs(e.amount).toLocaleString()} · ${e.category}`, ts: e.date });
  });
  FinanceStore.getInvoices().forEach(inv => {
    events.push({ id: inv.id, dept: 'Finance', icon: '🧾', type: 'invoice', title: `Invoice ${inv.id}: ${inv.client}`, meta: `$${inv.total?.toLocaleString()} · ${inv.status}`, ts: inv.created });
  });
  HRStore.getEmployees().forEach(e => {
    events.push({ id: e.id, dept: 'HR', icon: '👤', type: 'employee', title: `Employee: ${e.name}`, meta: `${e.role} · ${e.department}`, ts: e.created });
  });
  HRStore.getPerformance().forEach(p => {
    events.push({ id: p.id, dept: 'HR', icon: '⭐', type: 'review', title: `Review: ${p.summary?.slice(0,60) || 'Performance review'}`, meta: `Rating: ${p.rating}/5`, ts: p.date });
  });
  MarketingStore.getCampaigns().forEach(c => {
    events.push({ id: c.id, dept: 'Marketing', icon: '🚀', type: 'campaign', title: `Campaign: ${c.name}`, meta: `${c.status} · ${c.leads} leads`, ts: c.created });
  });
  MarketingStore.getContent().forEach(c => {
    events.push({ id: c.id, dept: 'Marketing', icon: '📝', type: 'content', title: `Content: ${c.title}`, meta: `${c.type} · ${c.status}`, ts: c.created });
  });
  SalesStore.getDeals().forEach(d => {
    events.push({ id: d.id, dept: 'Sales', icon: '💼', type: 'deal', title: `Deal: ${d.title}`, meta: `${d.stage} · $${d.value?.toLocaleString()}`, ts: d.updated || d.created });
  });
  SalesStore.getContacts().forEach(c => {
    events.push({ id: c.id, dept: 'Sales', icon: '📇', type: 'contact', title: `Contact: ${c.name}`, meta: `${c.company} · ${c.source || ''}`, ts: c.created });
  });
  WarRoomStore.getThreads().forEach(t => {
    events.push({ id: t.id, dept: 'War Room', icon: '💬', type: 'thread', title: `Thread: ${t.subject}`, meta: `${t.from} → ${t.to} · ${t.messages.length} messages`, ts: t.lastActivity });
  });

  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  res.json(events.slice(0, limit));
});

// ── Dept AI Autopilot ─────────────────────────────────────────────
app.post('/api/autopilot', async (req, res) => {
  const { dept } = req.body;
  if (!dept) return res.status(400).json({ error: 'dept required' });

  let context = '';
  if (dept === 'it' || dept === 'all') {
    const tickets = ITStore.getTickets();
    const registry = ITStore.getRegistry();
    const crit = tickets.filter(t => t.priority === 'critical' && t.status !== 'closed');
    const blocked = tickets.filter(t => t.status === 'blocked');
    context += `IT: ${tickets.length} tickets (${crit.length} critical, ${blocked.length} blocked), ${registry.length} agents/users registered.\n`;
  }
  if (dept === 'finance' || dept === 'all') {
    const sum = FinanceStore.getSummary();
    const invoices = FinanceStore.getInvoices();
    const overdue = invoices.filter(i => i.status === 'overdue');
    context += `Finance: revenue $${sum.revenue.toLocaleString()}, expenses $${sum.expenses.toLocaleString()}, net $${sum.net.toLocaleString()}. ${overdue.length} overdue invoices.\n`;
  }
  if (dept === 'hr' || dept === 'all') {
    const emps = HRStore.getEmployees();
    const active = emps.filter(e => e.status === 'active');
    const needsOnboard = emps.filter(e => !e.onboarded && e.status === 'active');
    context += `HR: ${active.length} active employees, ${needsOnboard.length} need onboarding.\n`;
  }
  if (dept === 'marketing' || dept === 'all') {
    const camps = MarketingStore.getCampaigns();
    const active = camps.filter(c => c.status === 'active');
    const totalLeads = camps.reduce((s, c) => s + (c.leads || 0), 0);
    context += `Marketing: ${camps.length} campaigns (${active.length} active), ${totalLeads} total leads.\n`;
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You are an AI Chief Operating Officer monitoring business departments.
Analyze the data and give 3-5 specific, actionable alerts or recommendations.
Be direct and prioritize the most critical issues. Use bullet points. Keep each point under 2 sentences.`,
      messages: [{ role: 'user', content: `Current department data:\n${context}\nWhat requires immediate attention?` }],
    });
    res.json({ ok: true, dept, analysis: response.content[0]?.text || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CSV Export ────────────────────────────────────────────────────
app.get('/api/finance/ledger/export', (req, res) => {
  const ledger = FinanceStore.getLedger();
  const rows = [['Date','Type','Description','Category','Project','Amount']];
  ledger.forEach(e => rows.push([
    new Date(e.date).toISOString().slice(0,10),
    e.type, `"${e.description}"`, e.category, e.project || '', e.amount,
  ]));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ledger.csv"');
  res.send(rows.map(r => r.join(',')).join('\n'));
});

app.get('/api/hr/employees/export', (req, res) => {
  const emps = HRStore.getEmployees();
  const rows = [['ID','Name','Role','Department','Email','Status','Start Date','Manager']];
  emps.forEach(e => rows.push([e.id, `"${e.name}"`, `"${e.role}"`, e.department, e.email || '', e.status, e.startDate || '', e.manager || '']));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
  res.send(rows.map(r => r.join(',')).join('\n'));
});

startScheduler();

// ── Scheduled Weekly Report ────────────────────────────────────────
async function sendWeeklyReportToSlack() {
  const settings = SettingsStore.get();
  if (!settings.weeklyReportEnabled || !settings.slackWebhookUrl) return;
  try {
    const finSum = FinanceStore.getSummary();
    const tickets = ITStore.getTickets();
    const emps = HRStore.getEmployees();
    const camps = MarketingStore.getCampaigns();
    const pipeline = SalesStore.getPipeline();
    const context = `Weekly snapshot: IT ${tickets.filter(t=>t.status==='open').length} open tickets. Finance net $${finSum.net?.toLocaleString()}. HR ${emps.filter(e=>e.status==='active').length} active. Marketing ${camps.filter(c=>c.status==='active').length} campaigns. Sales pipeline $${pipeline.totalValue?.toLocaleString()}.`;
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5', max_tokens: 500,
      messages: [{ role: 'user', content: `Write a 3-bullet weekly business summary for Slack (use emoji, be concise): ${context}` }],
    });
    const text = resp.content[0]?.text || '';
    // Post to Slack
    if (settings.slackWebhookUrl) {
      await fetch(settings.slackWebhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `📋 *AI-BOS Weekly Report*\n\n${text}` }),
      });
    }
    // Send via SendGrid if configured
    const sgKey = process.env.SENDGRID_API_KEY || settings.sendgridKey;
    if (sgKey && settings.reportEmail) {
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: settings.reportEmail }] }],
          from: { email: settings.emailFrom || 'reports@aibos.ai', name: 'AI-BOS' },
          subject: `📋 AI-BOS Weekly Report — ${new Date().toLocaleDateString()}`,
          content: [{ type: 'text/plain', value: text }],
        }),
      });
    }
    console.log('[Scheduler] Weekly report sent');
  } catch (err) { console.error('[Scheduler] Weekly report failed:', err.message); }
}

// Schedule: every Monday at 9am (check every 5 minutes)
setInterval(() => {
  const now = new Date();
  if (now.getDay() === 1 && now.getHours() === 9 && now.getMinutes() < 5) {
    sendWeeklyReportToSlack();
  }
}, 5 * 60 * 1000);

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// WebSocket: broadcast to all connected clients
function broadcast(event, data) {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  wss.clients.forEach(client => { if (client.readyState === 1) client.send(msg); });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ event: 'connected', data: { msg: 'AI-BOS live feed connected' }, ts: Date.now() }));
});

// Make broadcast available globally
global.aibosWsBroadcast = broadcast;

// Register stores globally so actions.js can use them without circular imports
global.aibosStores = { ITStore, FinanceStore, HRStore, MarketingStore, SalesStore, LegalStore, OpsStore, WarRoomStore };

// Hook trigger engine into broadcast — every WS event can fire triggers
const _origBroadcast = broadcast;
function broadcastAndTrigger(event, data) {
  _origBroadcast(event, data);
  try { fireTrigger(event, data); } catch {}
}
global.aibosWsBroadcast = broadcastAndTrigger;

// Init trigger engine + scheduled checks
initTriggers();
startScheduledChecks({ ITStore, FinanceStore, HRStore, MarketingStore, SalesStore, LegalStore, OpsStore });

httpServer.listen(PORT, () => {
  console.log(`\n AI-BOS running at http://localhost:${PORT}`);
  console.log(` API key: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING — set in config/.env'}`);
  console.log(` Memory records: ${MemoryStore.count()}\n`);
});
