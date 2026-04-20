// agent-council/actions.js
// Action system — what agents can actually DO in the real world
// Every action is logged to the approval queue before or after execution
// depending on whether it requires human approval.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = path.resolve(__dirname, '../knowledge/departments/council/action-queue.json');
const LOG_FILE   = path.resolve(__dirname, '../knowledge/departments/council/action-log.json');

// ── Persistence ────────────────────────────────────────────────────
function readQueue() {
  try {
    if (!fs.existsSync(QUEUE_FILE)) return [];
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
  } catch { return []; }
}
function writeQueue(q) {
  fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
}
function readLog() {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch { return []; }
}
function writeLog(l) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.writeFileSync(LOG_FILE, JSON.stringify(l.slice(0, 500), null, 2));
}

// ── Action Queue API ───────────────────────────────────────────────
export function getQueue() { return readQueue(); }
export function getLog(limit = 100) { return readLog().slice(0, limit); }

// Queue a pending action that needs human approval
export function queueAction({ agent, agentName, emoji, color, type, title, description, payload, autoApprove = false }) {
  const queue = readQueue();
  const action = {
    id: Math.random().toString(36).slice(2),
    agent, agentName, emoji, color,
    type,       // 'send_email' | 'post_slack' | 'create_record' | 'update_record' | 'external_webhook'
    title,      // short human-readable label
    description,
    payload,    // the actual data needed to execute
    status: autoApprove ? 'auto-approved' : 'pending',
    autoApprove,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    executedAt: null,
    result: null,
  };
  queue.unshift(action);
  writeQueue(queue.slice(0, 200));

  // Broadcast via WebSocket if available
  if (global.aibosWsBroadcast) {
    global.aibosWsBroadcast('action:queued', { id: action.id, title, agent, autoApprove });
  }

  return action;
}

// Approve a pending action and execute it
export async function approveAction(id) {
  const queue = readQueue();
  const idx = queue.findIndex(a => a.id === id);
  if (idx < 0) return { error: 'Action not found' };
  if (queue[idx].status !== 'pending') return { error: 'Action is not pending' };

  queue[idx].status = 'approved';
  queue[idx].reviewedAt = new Date().toISOString();
  writeQueue(queue);

  return await executeAction(queue[idx]);
}

// Reject a pending action
export function rejectAction(id, reason = '') {
  const queue = readQueue();
  const idx = queue.findIndex(a => a.id === id);
  if (idx < 0) return { error: 'Not found' };
  queue[idx].status = 'rejected';
  queue[idx].reviewedAt = new Date().toISOString();
  queue[idx].result = { rejected: true, reason };
  writeQueue(queue);
  logAction(queue[idx]);
  if (global.aibosWsBroadcast) global.aibosWsBroadcast('action:rejected', { id });
  return queue[idx];
}

// Execute an approved action
export async function executeAction(action) {
  const queue = readQueue();
  const idx = queue.findIndex(a => a.id === action.id);

  let result;
  try {
    result = await runAction(action);
    if (idx >= 0) {
      queue[idx].status = 'executed';
      queue[idx].executedAt = new Date().toISOString();
      queue[idx].result = result;
    }
    if (global.aibosWsBroadcast) global.aibosWsBroadcast('action:executed', { id: action.id, result });
  } catch (err) {
    result = { error: err.message };
    if (idx >= 0) {
      queue[idx].status = 'failed';
      queue[idx].result = result;
    }
    if (global.aibosWsBroadcast) global.aibosWsBroadcast('action:failed', { id: action.id, error: err.message });
  }

  if (idx >= 0) writeQueue(queue);
  logAction(idx >= 0 ? queue[idx] : { ...action, result });
  return result;
}

// Execute auto-approved actions immediately
export async function runAutoApproved() {
  const queue = readQueue();
  const pending = queue.filter(a => a.autoApprove && a.status === 'auto-approved');
  for (const action of pending) {
    await executeAction(action);
  }
}

function logAction(action) {
  const log = readLog();
  log.unshift({ ...action, loggedAt: new Date().toISOString() });
  writeLog(log);
}

// ── Action Executors ───────────────────────────────────────────────
async function runAction(action) {
  switch (action.type) {
    case 'send_email':   return await sendEmail(action.payload);
    case 'post_slack':   return await postSlack(action.payload);
    case 'war_room':     return postWarRoom(action.payload);
    case 'create_record': return createRecord(action.payload);
    case 'update_record': return updateRecord(action.payload);
    case 'webhook':      return await callWebhook(action.payload);
    default: return { error: `Unknown action type: ${action.type}` };
  }
}

// Send email — tries SendGrid first, then SMTP, then simulates
async function sendEmail({ to, subject, body, from }) {
  const settings = getSettings();
  const sgKey = process.env.SENDGRID_API_KEY || settings.sendgridKey;

  // ── SendGrid (preferred) ──────────────────────────────────────────
  if (sgKey) {
    const fromAddr = from || settings.emailFrom || 'AI-BOS <noreply@aibos.ai>';
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sgKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromAddr.includes('<') ? fromAddr.match(/<(.+)>/)[1] : fromAddr, name: 'AI-BOS' },
        subject,
        content: [
          { type: 'text/plain', value: body },
          { type: 'text/html',  value: `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#07080f;color:#e8edf5;border-radius:12px">
            <div style="font-size:1.1rem;font-weight:700;margin-bottom:16px;color:#818cf8">🤖 AI-BOS</div>
            <pre style="white-space:pre-wrap;font-family:inherit;font-size:0.9rem;line-height:1.6">${body}</pre>
            <hr style="border:none;border-top:1px solid #1c2035;margin:20px 0"/>
            <div style="font-size:0.75rem;color:#5a6480">Sent automatically by AI-BOS Agent System</div>
          </div>` },
        ],
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`SendGrid error ${r.status}: ${err}`);
    }
    console.log(`[ACTION:EMAIL] Sent via SendGrid → ${to}`);
    return { sent: true, to, subject, method: 'sendgrid' };
  }

  // ── SMTP fallback ─────────────────────────────────────────────────
  try {
    const nodemailer = await import('nodemailer').catch(() => null);
    if (nodemailer && settings.smtpHost) {
      const transporter = nodemailer.default.createTransport({
        host: settings.smtpHost, port: settings.smtpPort || 587, secure: false,
        auth: { user: settings.smtpUser, pass: settings.smtpPass },
      });
      await transporter.sendMail({
        from: from || settings.smtpFrom || 'AI-BOS <noreply@aibos.ai>',
        to, subject, text: body,
        html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${body}</pre>`,
      });
      return { sent: true, to, subject, method: 'smtp' };
    }
  } catch {}

  // ── Simulated fallback ────────────────────────────────────────────
  console.log(`[ACTION:EMAIL] Simulated → ${to} | Subject: ${subject}`);
  return { sent: true, to, subject, method: 'simulated', note: 'Add SENDGRID_API_KEY to .env to send real emails' };
}

// Post to Slack webhook
async function postSlack({ message, channel, username }) {
  const settings = getSettings();
  if (!settings.slackWebhookUrl) {
    console.log(`[ACTION:SLACK] ${message}`);
    return { posted: true, method: 'simulated', note: 'Configure Slack webhook in Settings' };
  }
  const r = await fetch(settings.slackWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: message,
      username: username || '🤖 AI-BOS Agent',
      ...(channel ? { channel } : {}),
    }),
  });
  if (!r.ok) throw new Error(`Slack returned ${r.status}`);
  return { posted: true, method: 'slack' };
}

// Post to War Room thread
function postWarRoom({ subject, body, from, priority }) {
  const { WarRoomStore } = get_stores();
  if (!WarRoomStore) {
    console.warn('[ACTION:WAR_ROOM] WarRoomStore not available yet');
    return { posted: false, note: 'WarRoomStore unavailable' };
  }
  WarRoomStore.addThread({ subject, body, from: from || '🤖 Agent', to: 'all', priority: priority || 'normal' });
  return { posted: true, destination: 'war-room' };
}

// Create a record in a dept store
function createRecord({ dept, recordType, data }) {
  const { ITStore, FinanceStore, HRStore, MarketingStore, SalesStore, LegalStore, OpsStore } = get_stores();
  const map = {
    'it.ticket': () => ITStore.addTicket(data),
    'finance.ledger': () => FinanceStore.addEntry(data),
    'hr.employee': () => HRStore.addEmployee(data),
    'marketing.campaign': () => MarketingStore.addCampaign(data),
    'sales.contact': () => SalesStore.addContact(data),
    'sales.deal': () => SalesStore.addDeal(data),
    'legal.contract': () => LegalStore.addContract(data),
    'legal.risk': () => LegalStore.addRisk(data),
    'ops.task': () => OpsStore.addTask(data),
    'ops.project': () => OpsStore.addProject(data),
  };
  const key = `${dept}.${recordType}`;
  if (!map[key]) return { error: `Unknown record type: ${key}` };
  const record = map[key]();
  if (global.aibosWsBroadcast) global.aibosWsBroadcast(`${dept}:${recordType}:created`, record);
  return { created: true, record };
}

// Update an existing record
function updateRecord({ dept, recordType, id, updates }) {
  const { ITStore, FinanceStore, HRStore, SalesStore, LegalStore, OpsStore } = get_stores();
  const map = {
    'it.ticket': () => ITStore.updateTicket(id, updates),
    'finance.invoice': () => FinanceStore.updateInvoice(id, updates),
    'hr.employee': () => HRStore.updateEmployee(id, updates),
    'sales.deal': () => SalesStore.updateDeal(id, updates),
    'legal.contract': () => LegalStore.updateContract(id, updates),
    'ops.task': () => OpsStore.updateTask(id, updates),
    'ops.project': () => OpsStore.updateProject(id, updates),
  };
  const key = `${dept}.${recordType}`;
  if (!map[key]) return { error: `Unknown record type: ${key}` };
  const record = map[key]();
  if (global.aibosWsBroadcast) global.aibosWsBroadcast(`${dept}:${recordType}:updated`, record);
  return { updated: true, record };
}

// Call external webhook
async function callWebhook({ url, method = 'POST', body, headers = {} }) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, ok: r.ok };
}

// Lazy load stores to avoid circular deps
function get_stores() {
  // Use global cache set by index.js
  return global.aibosStores || {};
}

function getSettings() {
  try {
    const settingsPath = path.resolve(__dirname, '../knowledge/settings.json');
    if (!fs.existsSync(settingsPath)) return {};
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch { return {}; }
}

// Workaround for sync import in non-async context
function await_sync_import() {
  return global.aibosStores || {};
}
