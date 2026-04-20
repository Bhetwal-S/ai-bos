// agent-council/goals.js
// Goal system — each agent has measurable goals it works toward autonomously.
// Goals are evaluated every council cycle. If progress is off-track,
// the agent takes corrective action.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOALS_FILE = path.resolve(__dirname, '../knowledge/departments/council/goals.json');

// ── Default goals per agent ────────────────────────────────────────
const DEFAULT_GOALS = {
  it: [
    {
      id: 'it.ticket_resolution',
      agent: 'it',
      label: 'Keep open tickets below 10',
      metric: 'open_tickets',
      target: 10,
      direction: 'below', // 'below' | 'above' | 'exact'
      priority: 'high',
      enabled: true,
    },
    {
      id: 'it.zero_critical',
      agent: 'it',
      label: 'Zero unresolved critical tickets',
      metric: 'critical_open',
      target: 0,
      direction: 'exact',
      priority: 'critical',
      enabled: true,
    },
  ],
  finance: [
    {
      id: 'finance.positive_cashflow',
      agent: 'finance',
      label: 'Maintain positive net P&L',
      metric: 'net_pnl',
      target: 0,
      direction: 'above',
      priority: 'critical',
      enabled: true,
    },
    {
      id: 'finance.zero_overdue',
      agent: 'finance',
      label: 'Zero overdue invoices',
      metric: 'overdue_invoices',
      target: 0,
      direction: 'exact',
      priority: 'high',
      enabled: true,
    },
    {
      id: 'finance.revenue_growth',
      agent: 'finance',
      label: 'Revenue above $50,000',
      metric: 'total_revenue',
      target: 50000,
      direction: 'above',
      priority: 'medium',
      enabled: true,
    },
  ],
  hr: [
    {
      id: 'hr.onboarding_complete',
      agent: 'hr',
      label: 'All employees onboarded within 14 days',
      metric: 'pending_onboarding',
      target: 0,
      direction: 'exact',
      priority: 'medium',
      enabled: true,
    },
    {
      id: 'hr.avg_rating',
      agent: 'hr',
      label: 'Average performance rating above 3.5',
      metric: 'avg_performance',
      target: 3.5,
      direction: 'above',
      priority: 'medium',
      enabled: true,
    },
  ],
  marketing: [
    {
      id: 'marketing.active_campaigns',
      agent: 'marketing',
      label: 'At least 1 active campaign',
      metric: 'active_campaigns',
      target: 1,
      direction: 'above',
      priority: 'high',
      enabled: true,
    },
    {
      id: 'marketing.lead_generation',
      agent: 'marketing',
      label: 'Generate 50+ total leads',
      metric: 'total_leads',
      target: 50,
      direction: 'above',
      priority: 'high',
      enabled: true,
    },
  ],
  sales: [
    {
      id: 'sales.pipeline_value',
      agent: 'sales',
      label: 'Pipeline weighted value above $100k',
      metric: 'pipeline_weighted',
      target: 100000,
      direction: 'above',
      priority: 'high',
      enabled: true,
    },
    {
      id: 'sales.open_deals',
      agent: 'sales',
      label: 'At least 3 active deals',
      metric: 'open_deals',
      target: 3,
      direction: 'above',
      priority: 'medium',
      enabled: true,
    },
  ],
};

// ── Metric measurement ─────────────────────────────────────────────
export function measureGoals(stores) {
  const { ITStore, FinanceStore, HRStore, MarketingStore, SalesStore } = stores;
  const results = {};

  // IT metrics
  try {
    const tickets = ITStore.getTickets();
    results.open_tickets = tickets.filter(t => t.status === 'open').length;
    results.critical_open = tickets.filter(t => t.priority === 'critical' && t.status !== 'closed').length;
  } catch {}

  // Finance metrics
  try {
    const sum = FinanceStore.getSummary();
    const invoices = FinanceStore.getInvoices();
    results.net_pnl = sum.net || 0;
    results.total_revenue = sum.revenue || 0;
    results.overdue_invoices = invoices.filter(i => i.status === 'overdue').length;
  } catch {}

  // HR metrics
  try {
    const emps = HRStore.getEmployees();
    const perf = HRStore.getPerformance();
    results.pending_onboarding = emps.filter(e => !e.onboarded && e.status === 'active').length;
    results.avg_performance = perf.length
      ? parseFloat((perf.reduce((s, p) => s + +p.rating, 0) / perf.length).toFixed(2))
      : 0;
  } catch {}

  // Marketing metrics
  try {
    const camps = MarketingStore.getCampaigns();
    results.active_campaigns = camps.filter(c => c.status === 'active').length;
    results.total_leads = camps.reduce((s, c) => s + (c.leads || 0), 0);
  } catch {}

  // Sales metrics
  try {
    const pipeline = SalesStore.getPipeline();
    results.pipeline_weighted = pipeline.weighted || 0;
    results.open_deals = pipeline.totalOpen || 0;
  } catch {}

  return results;
}

// Evaluate all goals against current metrics
export function evaluateGoals(stores) {
  const metrics = measureGoals(stores);
  const allGoals = loadGoals();
  const evaluation = [];

  for (const agentGoals of Object.values(allGoals)) {
    for (const goal of agentGoals) {
      if (!goal.enabled) continue;
      const current = metrics[goal.metric] ?? null;
      const status = current === null ? 'unknown' : checkGoal(goal, current);
      evaluation.push({
        ...goal,
        current,
        status, // 'on_track' | 'off_track' | 'critical' | 'unknown'
        gap: current !== null ? calculateGap(goal, current) : null,
      });
    }
  }

  // Save snapshot
  saveGoalSnapshot(evaluation, metrics);
  return evaluation;
}

function checkGoal(goal, current) {
  const { target, direction, priority } = goal;
  let met = false;
  if (direction === 'above') met = current >= target;
  else if (direction === 'below') met = current <= target;
  else if (direction === 'exact') met = current === target;

  if (met) return 'on_track';
  if (priority === 'critical') return 'critical';
  const pct = target !== 0 ? Math.abs(current - target) / Math.abs(target) : 1;
  return pct > 0.5 ? 'critical' : 'off_track';
}

function calculateGap(goal, current) {
  if (goal.direction === 'above') return current - goal.target; // negative = below target
  if (goal.direction === 'below') return goal.target - current; // negative = above limit
  return Math.abs(current - goal.target); // exact: distance from target
}

// Build a goal summary string for an agent to include in its prompt
export function buildGoalContext(agentKey, stores) {
  const metrics = measureGoals(stores);
  const allGoals = loadGoals();
  const goals = allGoals[agentKey] || [];

  if (!goals.length) return '';

  const lines = goals.filter(g => g.enabled).map(goal => {
    const current = metrics[goal.metric] ?? 'unknown';
    const status = current !== 'unknown' ? checkGoal(goal, current) : 'unknown';
    const icon = status === 'on_track' ? '✅' : status === 'critical' ? '🔴' : '⚠️';
    return `${icon} ${goal.label}: current=${current}, target=${goal.direction} ${goal.target} → ${status.toUpperCase()}`;
  });

  return `\nYour Goals:\n${lines.join('\n')}`;
}

// ── Persistence ────────────────────────────────────────────────────
function loadGoals() {
  try {
    if (!fs.existsSync(GOALS_FILE)) return DEFAULT_GOALS;
    const saved = JSON.parse(fs.readFileSync(GOALS_FILE, 'utf-8'));
    // Merge saved with defaults (saved overrides defaults)
    const merged = { ...DEFAULT_GOALS };
    Object.entries(saved).forEach(([k, v]) => { merged[k] = v; });
    return merged;
  } catch { return DEFAULT_GOALS; }
}

export function saveGoals(goals) {
  fs.mkdirSync(path.dirname(GOALS_FILE), { recursive: true });
  fs.writeFileSync(GOALS_FILE, JSON.stringify(goals, null, 2));
}

export function getGoals() { return loadGoals(); }

export function updateGoal(agentKey, goalId, updates) {
  const goals = loadGoals();
  if (!goals[agentKey]) return null;
  const idx = goals[agentKey].findIndex(g => g.id === goalId);
  if (idx < 0) return null;
  goals[agentKey][idx] = { ...goals[agentKey][idx], ...updates };
  saveGoals(goals);
  return goals[agentKey][idx];
}

const SNAPSHOT_FILE = path.resolve(__dirname, '../knowledge/departments/council/goal-snapshots.json');

function saveGoalSnapshot(evaluation, metrics) {
  try {
    let snaps = [];
    if (fs.existsSync(SNAPSHOT_FILE)) snaps = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8'));
    snaps.unshift({ ts: new Date().toISOString(), metrics, evaluation: evaluation.map(g => ({ id: g.id, status: g.status, current: g.current })) });
    fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snaps.slice(0, 100), null, 2));
  } catch {}
}

export function getGoalHistory(limit = 30) {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return [];
    return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8')).slice(0, limit);
  } catch { return []; }
}
