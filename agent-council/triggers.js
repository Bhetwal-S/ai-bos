// agent-council/triggers.js
// Trigger engine — agents react to real-time events, not just timers.
// When data changes (via WebSocket broadcast), triggers fire and agents respond.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { queueAction } from './actions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRIGGERS_FILE = path.resolve(__dirname, '../knowledge/departments/council/triggers.json');

// ── Built-in trigger rules ─────────────────────────────────────────
// Each rule: { event, condition(data), agentKey, actionType, buildAction(data) }
const TRIGGER_RULES = [

  // ── IT ──────────────────────────────────────────────────────────
  {
    id: 'it.critical_ticket',
    event: 'ticket:created',
    label: 'Critical Ticket Created',
    agentKey: 'it', agentName: 'Atlas', emoji: '☁️', color: '#378ADD',
    condition: (data) => data.priority === 'critical',
    autoApprove: true,
    buildAction: (data) => ({
      type: 'post_slack',
      title: `🚨 Critical ticket: "${data.title}"`,
      description: `IT Agent Atlas detected a new critical ticket and is alerting the team.`,
      payload: {
        message: `🚨 *Critical IT Ticket Created*\n*${data.title}*\nPriority: CRITICAL | ID: ${data.id}\n${data.description || ''}\n\n_AI-BOS Auto-alert from Atlas_`,
      },
    }),
  },

  {
    id: 'it.unassigned_critical',
    event: 'ticket:created',
    label: 'Auto-assign Unassigned Critical',
    agentKey: 'it', agentName: 'Atlas', emoji: '☁️', color: '#378ADD',
    condition: (data) => data.priority === 'critical' && !data.assignee,
    autoApprove: true,
    buildAction: (data) => ({
      type: 'war_room',
      title: `Critical ticket "${data.title}" needs assignment`,
      description: `Atlas is opening a War Room thread to get ${data.id} assigned immediately.`,
      payload: {
        subject: `🚨 Unassigned Critical Ticket: ${data.title}`,
        body: `Critical ticket ${data.id} was created without an assignee.\n\nTitle: ${data.title}\nDescription: ${data.description || 'No description'}\n\nAction required: Please assign this immediately.`,
        from: '🤖 Atlas (IT Agent)',
        priority: 'high',
      },
    }),
  },

  // ── Finance ──────────────────────────────────────────────────────
  {
    id: 'finance.invoice_large',
    event: 'finance:invoice:created',
    label: 'Large Invoice Created',
    agentKey: 'finance', agentName: 'Ledger', emoji: '💰', color: '#34d399',
    condition: (data) => (data.total || 0) > 10000,
    autoApprove: false, // requires approval — large amounts
    buildAction: (data) => ({
      type: 'post_slack',
      title: `Large invoice created: $${data.total?.toLocaleString()} for ${data.client}`,
      description: `Ledger will notify the team about this significant invoice.`,
      payload: {
        message: `💰 *Large Invoice Created*\nClient: ${data.client}\nAmount: *$${data.total?.toLocaleString()}*\nDue: ${data.dueDate || 'TBD'}\nID: ${data.id}\n\n_Review in AI-BOS Finance → Invoices_`,
      },
    }),
  },

  {
    id: 'finance.overdue_reminder',
    event: 'finance:invoice:updated',
    label: 'Overdue Invoice Email Reminder',
    agentKey: 'finance', agentName: 'Ledger', emoji: '💰', color: '#34d399',
    condition: (data) => data.status === 'overdue',
    autoApprove: false, // requires approval — sends email to client
    buildAction: (data) => ({
      type: 'send_email',
      title: `Send overdue reminder to ${data.client}`,
      description: `Invoice ${data.id} is overdue. Ledger will send a payment reminder email.`,
      payload: {
        to: data.clientEmail || `billing@${(data.client || 'client').toLowerCase().replace(/\s/g, '')}.com`,
        subject: `Payment Reminder: Invoice ${data.id} — $${data.total?.toLocaleString()} Overdue`,
        body: `Dear ${data.client},\n\nThis is a friendly reminder that invoice ${data.id} for $${data.total?.toLocaleString()} is now overdue.\n\nOriginal due date: ${data.dueDate}\n\nPlease process this payment at your earliest convenience.\n\nIf you have any questions, please don't hesitate to contact us.\n\nBest regards,\nFinance Team\n\n— Sent automatically by AI-BOS`,
      },
    }),
  },

  // ── Sales ────────────────────────────────────────────────────────
  {
    id: 'sales.new_contact',
    event: 'sales:contact:created',
    label: 'New Lead Auto-qualify',
    agentKey: 'sales', agentName: 'Chase', emoji: '📈', color: '#fb923c',
    condition: () => true,
    autoApprove: true,
    buildAction: (data) => ({
      type: 'create_record',
      title: `Create qualification task for ${data.name}`,
      description: `New contact ${data.name} from ${data.company || 'unknown company'}. Chase will create a qualification task.`,
      payload: {
        dept: 'ops',
        recordType: 'task',
        data: {
          title: `Qualify lead: ${data.name} (${data.company || ''})`,
          priority: 'high',
          assignee: '',
          status: 'open',
          projectId: '',
        },
      },
    }),
  },

  {
    id: 'sales.deal_stale',
    event: 'deal:stale_check', // fired by the scheduler, not a mutation event
    label: 'Stale Deal Alert',
    agentKey: 'sales', agentName: 'Chase', emoji: '📈', color: '#fb923c',
    condition: (data) => data.daysSinceUpdate >= 14 && !['closed-won','closed-lost'].includes(data.stage),
    autoApprove: true,
    buildAction: (data) => ({
      type: 'post_slack',
      title: `Stale deal alert: "${data.title}"`,
      description: `Deal "${data.title}" hasn't been updated in ${data.daysSinceUpdate} days.`,
      payload: {
        message: `⚠️ *Stale Deal Alert*\n"${data.title}" — ${data.stage}\nValue: $${data.value?.toLocaleString()}\nNo activity in *${data.daysSinceUpdate} days*\n\n_Chase (Sales Agent) recommends following up_`,
      },
    }),
  },

  // ── HR ───────────────────────────────────────────────────────────
  {
    id: 'hr.new_employee_onboarding',
    event: 'hr:employee:created',
    label: 'New Employee Onboarding Tasks',
    agentKey: 'hr', agentName: 'Ember', emoji: '👥', color: '#a78bfa',
    condition: () => true,
    autoApprove: true,
    buildAction: (data) => ({
      type: 'war_room',
      title: `Onboarding thread for ${data.name}`,
      description: `Ember will open a War Room thread to coordinate onboarding for new hire.`,
      payload: {
        subject: `👋 New Employee Onboarding: ${data.name}`,
        body: `${data.name} has joined as ${data.role} in ${data.department}.\n\nOnboarding checklist:\n• IT: Set up laptop, accounts, VPN access\n• HR: Complete paperwork, benefits enrollment\n• Manager: Schedule 1:1, intro to team\n• IT: Add to relevant Slack channels\n\nStart date: ${data.startDate || 'TBD'}\n\n— Ember (HR Agent) created this automatically`,
        from: '🤖 Ember (HR Agent)',
        priority: 'normal',
      },
    }),
  },

  // ── Legal ────────────────────────────────────────────────────────
  {
    id: 'legal.contract_expiry',
    event: 'contract:expiry_check', // fired by scheduler
    label: 'Contract Expiry Warning',
    agentKey: 'legal', agentName: 'Counsel', emoji: '⚖️', color: '#94a3b8',
    condition: (data) => data.daysUntilExpiry <= 30 && data.daysUntilExpiry > 0 && data.status === 'active',
    autoApprove: true,
    buildAction: (data) => ({
      type: 'post_slack',
      title: `Contract "${data.name}" expires in ${data.daysUntilExpiry} days`,
      description: `Counsel will alert the team about the upcoming contract expiry.`,
      payload: {
        message: `⚖️ *Contract Expiry Warning*\n"${data.name}" with ${data.counterparty}\nExpires in: *${data.daysUntilExpiry} days* (${data.endDate})\nValue: $${(data.value||0).toLocaleString()}\n\n_Review and renew in AI-BOS Legal_`,
      },
    }),
  },

  // ── Marketing ────────────────────────────────────────────────────
  {
    id: 'marketing.campaign_low_leads',
    event: 'marketing:campaign:updated',
    label: 'Low-performing Campaign Alert',
    agentKey: 'marketing', agentName: 'Spark', emoji: '📣', color: '#f59e0b',
    condition: (data) => data.status === 'active' && (data.leads || 0) === 0 && data.budget > 0,
    autoApprove: true,
    buildAction: (data) => ({
      type: 'war_room',
      title: `Campaign "${data.name}" has zero leads`,
      description: `Spark noticed the campaign has spent budget but generated no leads.`,
      payload: {
        subject: `📣 Campaign Alert: "${data.name}" has 0 leads`,
        body: `Campaign "${data.name}" is active and has budget ($${data.budget?.toLocaleString()}) but has generated 0 leads.\n\nChannels: ${data.channels?.join(', ') || 'none'}\nGoal: ${data.goal || 'not set'}\n\nSpark recommends reviewing the campaign targeting or pausing it.\n\n— Spark (Marketing Agent)`,
        from: '🤖 Spark (Marketing Agent)',
        priority: 'normal',
      },
    }),
  },
];

// ── Trigger registration & firing ─────────────────────────────────
const listeners = new Map(); // event → [handler]

export function initTriggers() {
  // Register all built-in rules
  TRIGGER_RULES.forEach(rule => {
    if (!listeners.has(rule.event)) listeners.set(rule.event, []);
    listeners.get(rule.event).push(rule);
  });
  console.log(`[Triggers] Initialized ${TRIGGER_RULES.length} trigger rules across ${listeners.size} events`);
}

// Called by index.js whenever a WebSocket broadcast fires
export function fireTrigger(event, data) {
  const rules = listeners.get(event) || [];
  rules.forEach(rule => {
    try {
      if (!rule.condition(data)) return;
      const actionDef = rule.buildAction(data);
      queueAction({
        agent: rule.agentKey,
        agentName: rule.agentName,
        emoji: rule.emoji,
        color: rule.color,
        ...actionDef,
        autoApprove: rule.autoApprove,
      });
      console.log(`[Triggers] Fired: ${rule.id} → ${actionDef.type}`);
    } catch (err) {
      console.error(`[Triggers] Error in rule ${rule.id}:`, err.message);
    }
  });
}

// ── Scheduled trigger checks (run every 5 minutes) ─────────────────
// Checks for stale deals, expiring contracts, etc. that can't be
// detected from mutation events alone.
export function startScheduledChecks(stores) {
  const run = () => {
    checkStaleDeals(stores);
    checkContractExpiry(stores);
  };
  run(); // run immediately
  return setInterval(run, 5 * 60 * 1000);
}

function checkStaleDeals(stores) {
  try {
    const deals = stores.SalesStore?.getDeals?.() || [];
    deals.forEach(deal => {
      const lastUpdate = new Date(deal.updated || deal.created);
      const daysSince = Math.floor((Date.now() - lastUpdate) / 86400000);
      if (daysSince >= 14) {
        fireTrigger('deal:stale_check', { ...deal, daysSinceUpdate: daysSince });
      }
    });
  } catch {}
}

function checkContractExpiry(stores) {
  try {
    const contracts = stores.LegalStore?.getContracts?.() || [];
    contracts.forEach(contract => {
      if (!contract.endDate) return;
      const daysUntil = Math.floor((new Date(contract.endDate) - Date.now()) / 86400000);
      fireTrigger('contract:expiry_check', { ...contract, daysUntilExpiry: daysUntil });
    });
  } catch {}
}

// ── Custom trigger CRUD (let users add their own rules via UI) ──────
export function getCustomTriggers() {
  try {
    if (!fs.existsSync(TRIGGERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TRIGGERS_FILE, 'utf-8'));
  } catch { return []; }
}

export function saveCustomTrigger(trigger) {
  const triggers = getCustomTriggers();
  const existing = triggers.findIndex(t => t.id === trigger.id);
  if (existing >= 0) triggers[existing] = trigger;
  else triggers.push({ ...trigger, id: trigger.id || Math.random().toString(36).slice(2) });
  fs.mkdirSync(path.dirname(TRIGGERS_FILE), { recursive: true });
  fs.writeFileSync(TRIGGERS_FILE, JSON.stringify(triggers, null, 2));
  return trigger;
}

export function deleteCustomTrigger(id) {
  const triggers = getCustomTriggers().filter(t => t.id !== id);
  fs.writeFileSync(TRIGGERS_FILE, JSON.stringify(triggers, null, 2));
}

export { TRIGGER_RULES };
