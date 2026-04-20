// departments/store.js
// Per-department data stores + cross-department messaging

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPT_ROOT = path.resolve(__dirname, '../knowledge/departments');

function read(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return []; }
}

function write(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function p(dept, file) { return path.join(DEPT_ROOT, dept, file); }

// ── IT & DevOps ────────────────────────────────────────────────────
export const ITStore = {
  getTickets() { return read(p('it', 'tickets.json')); },
  addTicket({ title, priority = 'medium', type = 'bug', assignee = null, description = '' }) {
    const tickets = read(p('it', 'tickets.json'));
    const ticket = {
      id: `TKT-${String(tickets.length + 1).padStart(4, '0')}`,
      title, priority, type, assignee, description,
      status: 'open', created: new Date().toISOString(), updated: new Date().toISOString(),
    };
    tickets.unshift(ticket);
    write(p('it', 'tickets.json'), tickets);
    return ticket;
  },
  updateTicket(id, updates) {
    const tickets = read(p('it', 'tickets.json'));
    const idx = tickets.findIndex(t => t.id === id);
    if (idx === -1) return null;
    tickets[idx] = { ...tickets[idx], ...updates, updated: new Date().toISOString() };
    write(p('it', 'tickets.json'), tickets);
    return tickets[idx];
  },
  deleteTicket(id) { write(p('it', 'tickets.json'), read(p('it', 'tickets.json')).filter(t => t.id !== id)); },

  getRegistry() { return read(p('it', 'registry.json')); },
  addAgent({ name, role, permissions = [], status = 'active' }) {
    const registry = read(p('it', 'registry.json'));
    const agent = {
      id: crypto.randomUUID(), name, role, permissions, status,
      provisioned: new Date().toISOString(), lastActive: new Date().toISOString(),
    };
    registry.unshift(agent);
    write(p('it', 'registry.json'), registry);
    return agent;
  },
  updateAgent(id, updates) {
    const reg = read(p('it', 'registry.json'));
    const idx = reg.findIndex(a => a.id === id);
    if (idx === -1) return null;
    reg[idx] = { ...reg[idx], ...updates };
    write(p('it', 'registry.json'), reg);
    return reg[idx];
  },
};

// ── Finance & Operations ───────────────────────────────────────────
export const FinanceStore = {
  getLedger() { return read(p('finance', 'ledger.json')); },
  addEntry({ description, amount, category, project = null, type = 'expense' }) {
    const ledger = read(p('finance', 'ledger.json'));
    const entry = {
      id: crypto.randomUUID(), description, amount: parseFloat(amount),
      category, project, type, date: new Date().toISOString(),
    };
    ledger.unshift(entry);
    write(p('finance', 'ledger.json'), ledger);
    return entry;
  },
  deleteEntry(id) { write(p('finance', 'ledger.json'), read(p('finance', 'ledger.json')).filter(e => e.id !== id)); },
  getSummary() {
    const ledger = read(p('finance', 'ledger.json'));
    const expenses = ledger.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const revenue  = ledger.filter(e => e.type === 'revenue').reduce((s, e) => s + e.amount, 0);
    const byCategory = {};
    ledger.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    return { expenses, revenue, net: revenue - expenses, byCategory, total: ledger.length };
  },

  getInvoices() { return read(p('finance', 'invoices.json')); },
  addInvoice({ client, items = [], dueDate = null }) {
    const invoices = read(p('finance', 'invoices.json'));
    const total = items.reduce((s, i) => s + (i.qty * i.rate), 0);
    const invoice = {
      id: `INV-${String(invoices.length + 1).padStart(4, '0')}`,
      client, items, total, dueDate, status: 'draft',
      created: new Date().toISOString(),
    };
    invoices.unshift(invoice);
    write(p('finance', 'invoices.json'), invoices);
    return invoice;
  },
  updateInvoice(id, updates) {
    const invoices = read(p('finance', 'invoices.json'));
    const idx = invoices.findIndex(i => i.id === id);
    if (idx === -1) return null;
    invoices[idx] = { ...invoices[idx], ...updates };
    write(p('finance', 'invoices.json'), invoices);
    return invoices[idx];
  },
};

// ── Human Resources ────────────────────────────────────────────────
export const HRStore = {
  getEmployees() { return read(p('hr', 'employees.json')); },
  addEmployee({ name, role, department, email, startDate = null, manager = null }) {
    const employees = read(p('hr', 'employees.json'));
    const emp = {
      id: `EMP-${String(employees.length + 1).padStart(4, '0')}`,
      name, role, department, email, startDate, manager,
      status: 'active', permissions: [],
      onboarded: false, created: new Date().toISOString(),
    };
    employees.unshift(emp);
    write(p('hr', 'employees.json'), employees);
    return emp;
  },
  updateEmployee(id, updates) {
    const employees = read(p('hr', 'employees.json'));
    const idx = employees.findIndex(e => e.id === id);
    if (idx === -1) return null;
    employees[idx] = { ...employees[idx], ...updates };
    write(p('hr', 'employees.json'), employees);
    return employees[idx];
  },
  deleteEmployee(id) { write(p('hr', 'employees.json'), read(p('hr', 'employees.json')).filter(e => e.id !== id)); },

  getPerformance() { return read(p('hr', 'performance.json')); },
  addReview({ employeeId, rating, summary, metrics = {} }) {
    const perf = read(p('hr', 'performance.json'));
    const review = {
      id: crypto.randomUUID(), employeeId, rating, summary, metrics,
      date: new Date().toISOString(),
    };
    perf.unshift(review);
    write(p('hr', 'performance.json'), perf);
    return review;
  },
};

// ── Marketing & Growth ─────────────────────────────────────────────
export const MarketingStore = {
  getContent() { return read(p('marketing', 'content.json')); },
  addContent({ title, type, body, channel, campaign = null, tags = [] }) {
    const content = read(p('marketing', 'content.json'));
    const item = {
      id: crypto.randomUUID(), title, type, body, channel, campaign, tags,
      status: 'draft', created: new Date().toISOString(),
    };
    content.unshift(item);
    write(p('marketing', 'content.json'), content);
    return item;
  },
  updateContent(id, updates) {
    const content = read(p('marketing', 'content.json'));
    const idx = content.findIndex(c => c.id === id);
    if (idx === -1) return null;
    content[idx] = { ...content[idx], ...updates };
    write(p('marketing', 'content.json'), content);
    return content[idx];
  },
  deleteContent(id) { write(p('marketing', 'content.json'), read(p('marketing', 'content.json')).filter(c => c.id !== id)); },

  getCampaigns() { return read(p('marketing', 'campaigns.json')); },
  addCampaign({ name, goal, channels = [], budget = 0, startDate = null, endDate = null }) {
    const campaigns = read(p('marketing', 'campaigns.json'));
    const campaign = {
      id: crypto.randomUUID(), name, goal, channels, budget, startDate, endDate,
      status: 'planning', leads: 0, conversions: 0, created: new Date().toISOString(),
    };
    campaigns.unshift(campaign);
    write(p('marketing', 'campaigns.json'), campaigns);
    return campaign;
  },
  updateCampaign(id, updates) {
    const campaigns = read(p('marketing', 'campaigns.json'));
    const idx = campaigns.findIndex(c => c.id === id);
    if (idx === -1) return null;
    campaigns[idx] = { ...campaigns[idx], ...updates };
    write(p('marketing', 'campaigns.json'), campaigns);
    return campaigns[idx];
  },
};

// ── Sales & CRM ────────────────────────────────────────────────────
export const SalesStore = {
  getContacts() { return read(p('sales', 'contacts.json')); },
  addContact({ name, company, email, phone = null, source = null }) {
    const contacts = read(p('sales', 'contacts.json'));
    const contact = {
      id: crypto.randomUUID(), name, company, email, phone, source,
      status: 'lead', created: new Date().toISOString(),
    };
    contacts.unshift(contact);
    write(p('sales', 'contacts.json'), contacts);
    return contact;
  },
  updateContact(id, updates) {
    const contacts = read(p('sales', 'contacts.json'));
    const idx = contacts.findIndex(c => c.id === id);
    if (idx === -1) return null;
    contacts[idx] = { ...contacts[idx], ...updates };
    write(p('sales', 'contacts.json'), contacts);
    return contacts[idx];
  },
  deleteContact(id) { write(p('sales', 'contacts.json'), read(p('sales', 'contacts.json')).filter(c => c.id !== id)); },

  getDeals() { return read(p('sales', 'deals.json')); },
  addDeal({ title, contactId = null, company, value, stage = 'prospecting', closeDate = null, notes = '' }) {
    const deals = read(p('sales', 'deals.json'));
    const deal = {
      id: crypto.randomUUID(), title, contactId, company, value: parseFloat(value) || 0,
      stage, closeDate, notes, probability: STAGE_PROB[stage] || 10,
      created: new Date().toISOString(), updated: new Date().toISOString(),
    };
    deals.unshift(deal);
    write(p('sales', 'deals.json'), deals);
    return deal;
  },
  updateDeal(id, updates) {
    const deals = read(p('sales', 'deals.json'));
    const idx = deals.findIndex(d => d.id === id);
    if (idx === -1) return null;
    if (updates.stage) updates.probability = STAGE_PROB[updates.stage] || deals[idx].probability;
    deals[idx] = { ...deals[idx], ...updates, updated: new Date().toISOString() };
    write(p('sales', 'deals.json'), deals);
    return deals[idx];
  },
  deleteDeal(id) { write(p('sales', 'deals.json'), read(p('sales', 'deals.json')).filter(d => d.id !== id)); },
  getPipeline() {
    const deals = read(p('sales', 'deals.json'));
    const stages = ['prospecting','qualification','proposal','negotiation','closed-won','closed-lost'];
    const pipeline = {};
    stages.forEach(s => {
      const stageDeals = deals.filter(d => d.stage === s);
      pipeline[s] = { deals: stageDeals, count: stageDeals.length, value: stageDeals.reduce((sum,d) => sum+d.value,0) };
    });
    const weighted = deals.filter(d => !d.stage.startsWith('closed')).reduce((s,d) => s + d.value*(d.probability/100),0);
    return { pipeline, weighted, totalOpen: deals.filter(d=>!d.stage.startsWith('closed')).length, totalValue: deals.reduce((s,d)=>s+d.value,0) };
  },
};

const STAGE_PROB = { prospecting: 10, qualification: 25, proposal: 50, negotiation: 75, 'closed-won': 100, 'closed-lost': 0 };

// ── Cross-department War Room ──────────────────────────────────────
export const WarRoomStore = {
  getThreads() { return read(p('messages', 'threads.json')); },
  addThread({ subject, from, to = 'all', body, priority = 'normal' }) {
    const threads = read(p('messages', 'threads.json'));
    const thread = {
      id: crypto.randomUUID(), subject, from, to, priority,
      messages: [{ id: crypto.randomUUID(), from, body, timestamp: new Date().toISOString(), type: 'human' }],
      created: new Date().toISOString(), lastActivity: new Date().toISOString(),
    };
    threads.unshift(thread);
    write(p('messages', 'threads.json'), threads);
    return thread;
  },
  addMessage(threadId, { from, body, type = 'human' }) {
    const threads = read(p('messages', 'threads.json'));
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return null;
    const msg = { id: crypto.randomUUID(), from, body, timestamp: new Date().toISOString(), type };
    thread.messages.push(msg);
    thread.lastActivity = new Date().toISOString();
    write(p('messages', 'threads.json'), threads);
    return thread;
  },
  deleteThread(id) { write(p('messages', 'threads.json'), read(p('messages', 'threads.json')).filter(t => t.id !== id)); },
};

export const LegalStore = {
  getContracts() { return read(p('legal', 'contracts.json')); },
  addContract({ name, counterparty, type='NDA', value=0, startDate='', endDate='', status='pending' }) {
    const contracts = read(p('legal', 'contracts.json'));
    const contract = { id: crypto.randomUUID(), name, counterparty, type, value: parseFloat(value)||0, startDate, endDate, status, created: new Date().toISOString() };
    contracts.unshift(contract);
    write(p('legal', 'contracts.json'), contracts);
    return contract;
  },
  updateContract(id, updates) {
    const contracts = read(p('legal', 'contracts.json'));
    const idx = contracts.findIndex(c => c.id === id);
    if (idx < 0) return null;
    contracts[idx] = { ...contracts[idx], ...updates };
    write(p('legal', 'contracts.json'), contracts);
    return contracts[idx];
  },
  deleteContract(id) { write(p('legal', 'contracts.json'), read(p('legal', 'contracts.json')).filter(c => c.id !== id)); },
  getRisks() { return read(p('legal', 'risks.json')); },
  addRisk({ title, category='Legal', severity='medium', description='' }) {
    const risks = read(p('legal', 'risks.json'));
    const risk = { id: crypto.randomUUID(), title, category, severity, description, status:'open', created: new Date().toISOString() };
    risks.unshift(risk);
    write(p('legal', 'risks.json'), risks);
    return risk;
  },
  deleteRisk(id) { write(p('legal', 'risks.json'), read(p('legal', 'risks.json')).filter(r => r.id !== id)); },
};

export const OpsStore = {
  getProjects() { return read(p('ops', 'projects.json')); },
  addProject({ name, description='', status='planning', dueDate='', owner='' }) {
    const projects = read(p('ops', 'projects.json'));
    const project = { id: crypto.randomUUID(), name, description, status, dueDate, owner, created: new Date().toISOString() };
    projects.unshift(project);
    write(p('ops', 'projects.json'), projects);
    return project;
  },
  updateProject(id, updates) {
    const projects = read(p('ops', 'projects.json'));
    const idx = projects.findIndex(p => p.id === id);
    if (idx < 0) return null;
    projects[idx] = { ...projects[idx], ...updates };
    write(p('ops', 'projects.json'), projects);
    return projects[idx];
  },
  getTasks() { return read(p('ops', 'tasks.json')); },
  addTask({ title, projectId='', priority='medium', assignee='', dueDate='', status='open' }) {
    const tasks = read(p('ops', 'tasks.json'));
    const task = { id: crypto.randomUUID(), title, projectId, priority, assignee, dueDate, status, created: new Date().toISOString(), updated: new Date().toISOString() };
    tasks.unshift(task);
    write(p('ops', 'tasks.json'), tasks);
    return task;
  },
  updateTask(id, updates) {
    const tasks = read(p('ops', 'tasks.json'));
    const idx = tasks.findIndex(t => t.id === id);
    if (idx < 0) return null;
    tasks[idx] = { ...tasks[idx], ...updates, updated: new Date().toISOString() };
    write(p('ops', 'tasks.json'), tasks);
    return tasks[idx];
  },
  deleteTask(id) { write(p('ops', 'tasks.json'), read(p('ops', 'tasks.json')).filter(t => t.id !== id)); },
  getOKRs() { return read(p('ops', 'okrs.json')); },
  addOKR({ objective, keyResults=[], quarter='', owner='', progress=0 }) {
    const okrs = read(p('ops', 'okrs.json'));
    const okr = { id: crypto.randomUUID(), objective, keyResults, quarter, owner, progress: parseInt(progress)||0, created: new Date().toISOString() };
    okrs.unshift(okr);
    write(p('ops', 'okrs.json'), okrs);
    return okr;
  },
  updateOKR(id, updates) {
    const okrs = read(p('ops', 'okrs.json'));
    const idx = okrs.findIndex(o => o.id === id);
    if (idx < 0) return null;
    okrs[idx] = { ...okrs[idx], ...updates };
    write(p('ops', 'okrs.json'), okrs);
    return okrs[idx];
  },
  deleteOKR(id) { write(p('ops', 'okrs.json'), read(p('ops', 'okrs.json')).filter(o => o.id !== id)); },
};

// Settings store
export const SettingsStore = {
  _file() { return path.join(DEPT_ROOT, '..', 'settings.json'); },
  get() {
    try {
      if (!fs.existsSync(this._file())) return {};
      return JSON.parse(fs.readFileSync(this._file(), 'utf-8'));
    } catch { return {}; }
  },
  set(updates) {
    const current = this.get();
    const next = { ...current, ...updates };
    fs.mkdirSync(path.dirname(this._file()), { recursive: true });
    fs.writeFileSync(this._file(), JSON.stringify(next, null, 2));
    return next;
  },
};
