// seed.js — Run with: node seed.js
// Populates all departments with realistic test data
// Delete anytime: node seed.js --clear

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const id = () => crypto.randomBytes(6).toString('hex');
const now = new Date();
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString();

const DIRS = [
  'knowledge', 'knowledge/departments', 'knowledge/departments/council',
  'knowledge/departments/finance', 'knowledge/departments/hr',
  'knowledge/departments/it', 'knowledge/departments/marketing',
  'knowledge/departments/messages', 'knowledge/departments/sales',
  'knowledge/departments/legal', 'knowledge/departments/ops',
];
DIRS.forEach(d => fs.mkdirSync(path.join(__dirname, d), { recursive: true }));

const write = (file, data) => fs.writeFileSync(
  path.join(__dirname, 'knowledge', file), JSON.stringify(data, null, 2)
);

if (process.argv.includes('--clear')) {
  const files = [
    'departments/hr/employees.json', 'departments/finance/invoices.json',
    'departments/finance/ledger.json', 'departments/it/tickets.json',
    'departments/marketing/campaigns.json', 'departments/sales/contacts.json',
    'departments/sales/deals.json', 'departments/legal/contracts.json',
    'departments/ops/tasks.json', 'departments/ops/projects.json',
    'settings.json',
  ];
  files.forEach(f => {
    const p = path.join(__dirname, 'knowledge', f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  console.log('✅ All seed data cleared!');
  process.exit(0);
}

// ── HR ─────────────────────────────────────────────────────────────────
write('departments/hr/employees.json', [
  { id: id(), name: 'Alex Johnson', role: 'Full Stack Developer', department: 'Engineering', email: 'alex@getaibos.com', salary: 95000, status: 'active', startDate: daysAgo(180), performance: 88 },
  { id: id(), name: 'Sarah Chen', role: 'Product Manager', department: 'Product', email: 'sarah@getaibos.com', salary: 105000, status: 'active', startDate: daysAgo(365), performance: 92 },
  { id: id(), name: 'Marcus Williams', role: 'Sales Executive', department: 'Sales', email: 'marcus@getaibos.com', salary: 75000, status: 'active', startDate: daysAgo(90), performance: 78 },
  { id: id(), name: 'Priya Patel', role: 'UX Designer', department: 'Design', email: 'priya@getaibos.com', salary: 88000, status: 'active', startDate: daysAgo(200), performance: 95 },
  { id: id(), name: 'Tom Bradford', role: 'DevOps Engineer', department: 'Engineering', email: 'tom@getaibos.com', salary: 98000, status: 'on-leave', startDate: daysAgo(400), performance: 85 },
]);

// ── Finance ────────────────────────────────────────────────────────────
const invoices = [
  { id: id(), client: 'Acme Corp', amount: 12500, total: 12500, status: 'paid', dueDate: daysAgo(10), createdAt: daysAgo(30), description: 'Web development services Q1' },
  { id: id(), client: 'TechStart Ltd', amount: 8750, total: 8750, status: 'pending', dueDate: daysAgo(2), createdAt: daysAgo(20), description: 'UI/UX design retainer' },
  { id: id(), client: 'Global Media', amount: 24000, total: 24000, status: 'overdue', dueDate: daysAgo(15), createdAt: daysAgo(45), description: 'Platform integration project' },
  { id: id(), client: 'RetailPro Inc', amount: 6500, total: 6500, status: 'paid', dueDate: daysAgo(5), createdAt: daysAgo(25), description: 'Monthly SaaS subscription' },
  { id: id(), client: 'NextGen AI', amount: 32000, total: 32000, status: 'draft', dueDate: new Date(Date.now() + 30*86400000).toISOString(), createdAt: daysAgo(2), description: 'AI consulting Q2' },
];
write('departments/finance/invoices.json', invoices);

write('departments/finance/ledger.json', [
  { id: id(), description: 'Acme Corp payment received', credit: 12500, debit: 0, date: daysAgo(10), category: 'Revenue', createdAt: daysAgo(10) },
  { id: id(), description: 'AWS infrastructure costs', credit: 0, debit: 2840, date: daysAgo(5), category: 'Infrastructure', createdAt: daysAgo(5) },
  { id: id(), description: 'RetailPro subscription payment', credit: 6500, debit: 0, date: daysAgo(5), category: 'Revenue', createdAt: daysAgo(5) },
  { id: id(), description: 'Contractor payment - design work', credit: 0, debit: 3200, date: daysAgo(8), category: 'Contractors', createdAt: daysAgo(8) },
  { id: id(), description: 'Google Workspace subscription', credit: 0, debit: 420, date: daysAgo(12), category: 'Software', createdAt: daysAgo(12) },
  { id: id(), description: 'SendGrid email service', credit: 0, debit: 89, date: daysAgo(15), category: 'Software', createdAt: daysAgo(15) },
  { id: id(), description: 'Client deposit - NextGen AI', credit: 16000, debit: 0, date: daysAgo(3), category: 'Revenue', createdAt: daysAgo(3) },
]);

// ── IT ─────────────────────────────────────────────────────────────────
write('departments/it/tickets.json', [
  { id: id(), title: 'Production server response time degraded', description: 'API response times above 2s threshold', priority: 'critical', status: 'open', assignee: 'Tom Bradford', createdAt: daysAgo(1) },
  { id: id(), title: 'SSL certificate renewal needed', description: 'Cert expires in 14 days', priority: 'high', status: 'open', assignee: 'Tom Bradford', createdAt: daysAgo(3) },
  { id: id(), title: 'Setup new dev environment for Alex', description: 'New macbook setup required', priority: 'medium', status: 'in-progress', assignee: 'Tom Bradford', createdAt: daysAgo(5) },
  { id: id(), title: 'Slack integration not posting notifications', description: 'Webhook returning 400 errors intermittently', priority: 'high', status: 'open', assignee: null, createdAt: daysAgo(2) },
  { id: id(), title: 'Database backup verification', description: 'Monthly backup integrity check', priority: 'low', status: 'closed', assignee: 'Tom Bradford', createdAt: daysAgo(10) },
  { id: id(), title: 'Update npm dependencies', description: '12 packages have security vulnerabilities', priority: 'medium', status: 'open', assignee: 'Alex Johnson', createdAt: daysAgo(4) },
]);

// ── Marketing ──────────────────────────────────────────────────────────
write('departments/marketing/campaigns.json', [
  { id: id(), name: 'Q2 SaaS Launch Campaign', status: 'active', budget: 5000, spent: 2300, leads: 47, channel: 'LinkedIn + Google Ads', startDate: daysAgo(14), endDate: new Date(Date.now() + 16*86400000).toISOString() },
  { id: id(), name: 'Email Nurture Sequence', status: 'active', budget: 500, spent: 120, leads: 23, channel: 'Email', startDate: daysAgo(30), endDate: new Date(Date.now() + 60*86400000).toISOString() },
  { id: id(), name: 'Product Hunt Launch', status: 'planned', budget: 1000, spent: 0, leads: 0, channel: 'Product Hunt', startDate: new Date(Date.now() + 7*86400000).toISOString(), endDate: new Date(Date.now() + 8*86400000).toISOString() },
  { id: id(), name: 'Q1 Cold Outreach', status: 'completed', budget: 2000, spent: 1980, leads: 89, channel: 'Email + LinkedIn', startDate: daysAgo(90), endDate: daysAgo(1) },
]);

// ── Sales ──────────────────────────────────────────────────────────────
write('departments/sales/contacts.json', [
  { id: id(), name: 'David Park', company: 'Acme Corp', email: 'david@acmecorp.com', phone: '+1 555 0101', status: 'customer', value: 12500, createdAt: daysAgo(60) },
  { id: id(), name: 'Lisa Rodriguez', company: 'TechStart Ltd', email: 'lisa@techstart.io', phone: '+1 555 0102', status: 'active', value: 8750, createdAt: daysAgo(30) },
  { id: id(), name: 'James Wilson', company: 'Global Media', email: 'james@globalmedia.com', phone: '+1 555 0103', status: 'at-risk', value: 24000, createdAt: daysAgo(45) },
  { id: id(), name: 'Emma Thompson', company: 'NextGen AI', email: 'emma@nextgenai.com', phone: '+1 555 0104', status: 'prospect', value: 32000, createdAt: daysAgo(7) },
  { id: id(), name: 'Ryan Kim', company: 'StartupXYZ', email: 'ryan@startupxyz.com', phone: '+1 555 0105', status: 'lead', value: 0, createdAt: daysAgo(2) },
]);

write('departments/sales/deals.json', [
  { id: id(), title: 'Acme Corp - Platform License', company: 'Acme Corp', value: 48000, stage: 'Closed Won', probability: 100, closeDate: daysAgo(5), assignee: 'Marcus Williams', createdAt: daysAgo(60) },
  { id: id(), title: 'TechStart - Annual SaaS', company: 'TechStart Ltd', value: 35000, stage: 'Negotiation', probability: 75, closeDate: new Date(Date.now() + 14*86400000).toISOString(), assignee: 'Marcus Williams', createdAt: daysAgo(30) },
  { id: id(), title: 'Global Media - Enterprise', company: 'Global Media', value: 96000, stage: 'Proposal', probability: 40, closeDate: new Date(Date.now() + 30*86400000).toISOString(), assignee: 'Marcus Williams', createdAt: daysAgo(20) },
  { id: id(), title: 'NextGen AI - Consulting', company: 'NextGen AI', value: 32000, stage: 'Qualified', probability: 60, closeDate: new Date(Date.now() + 21*86400000).toISOString(), assignee: 'Marcus Williams', createdAt: daysAgo(7) },
  { id: id(), title: 'StartupXYZ - Starter Plan', company: 'StartupXYZ', value: 6000, stage: 'Prospect', probability: 20, closeDate: new Date(Date.now() + 45*86400000).toISOString(), assignee: 'Marcus Williams', createdAt: daysAgo(2) },
]);

// ── Legal ──────────────────────────────────────────────────────────────
write('departments/legal/contracts.json', [
  { id: id(), title: 'Acme Corp MSA', type: 'MSA', client: 'Acme Corp', status: 'active', value: 48000, startDate: daysAgo(60), endDate: new Date(Date.now() + 305*86400000).toISOString(), createdAt: daysAgo(60) },
  { id: id(), title: 'TechStart NDA', type: 'NDA', client: 'TechStart Ltd', status: 'active', value: 0, startDate: daysAgo(30), endDate: new Date(Date.now() + 335*86400000).toISOString(), createdAt: daysAgo(30) },
  { id: id(), title: 'Global Media SOW', type: 'SOW', client: 'Global Media', status: 'review', value: 96000, startDate: null, endDate: null, createdAt: daysAgo(5) },
  { id: id(), title: 'Contractor Agreement - Design', type: 'Vendor', client: 'Freelance Designer', status: 'active', value: 12000, startDate: daysAgo(90), endDate: new Date(Date.now() + 90*86400000).toISOString(), createdAt: daysAgo(90) },
]);

write('departments/legal/risks.json', [
  { id: id(), title: 'Global Media invoice overdue 15 days', category: 'Financial', severity: 'high', status: 'open', createdAt: daysAgo(15) },
  { id: id(), title: 'SSL certificate expiring in 14 days', category: 'Technical', severity: 'medium', status: 'open', createdAt: daysAgo(3) },
  { id: id(), title: 'Contractor agreement renewal needed Q3', category: 'Compliance', severity: 'low', status: 'open', createdAt: daysAgo(1) },
]);

// ── Operations ─────────────────────────────────────────────────────────
write('departments/ops/projects.json', [
  { id: id(), name: 'AI-BOS Platform v2', description: 'Next major version with billing and mobile', status: 'active', progress: 35, startDate: daysAgo(30), endDate: new Date(Date.now() + 60*86400000).toISOString(), owner: 'Alex Johnson', createdAt: daysAgo(30) },
  { id: id(), name: 'Product Hunt Launch', description: 'Coordinated PH launch campaign', status: 'active', progress: 60, startDate: daysAgo(14), endDate: new Date(Date.now() + 7*86400000).toISOString(), owner: 'Sarah Chen', createdAt: daysAgo(14) },
  { id: id(), name: 'Enterprise Sales Playbook', description: 'Build repeatable enterprise sales process', status: 'planned', progress: 0, startDate: new Date(Date.now() + 7*86400000).toISOString(), endDate: new Date(Date.now() + 37*86400000).toISOString(), owner: 'Marcus Williams', createdAt: daysAgo(2) },
]);

write('departments/ops/tasks.json', [
  { id: id(), title: 'Fix production API response times', status: 'in-progress', priority: 'critical', assignee: 'Tom Bradford', project: 'AI-BOS Platform v2', dueDate: new Date(Date.now() + 1*86400000).toISOString(), createdAt: daysAgo(1) },
  { id: id(), title: 'Write Product Hunt launch copy', status: 'in-progress', priority: 'high', assignee: 'Sarah Chen', project: 'Product Hunt Launch', dueDate: new Date(Date.now() + 3*86400000).toISOString(), createdAt: daysAgo(5) },
  { id: id(), title: 'Follow up with Global Media on overdue invoice', status: 'open', priority: 'high', assignee: 'Marcus Williams', project: null, dueDate: new Date(Date.now() + 1*86400000).toISOString(), createdAt: daysAgo(2) },
  { id: id(), title: 'Renew SSL certificate', status: 'open', priority: 'high', assignee: 'Tom Bradford', project: null, dueDate: new Date(Date.now() + 7*86400000).toISOString(), createdAt: daysAgo(3) },
  { id: id(), title: 'Design new onboarding flow mockups', status: 'open', priority: 'medium', assignee: 'Priya Patel', project: 'AI-BOS Platform v2', dueDate: new Date(Date.now() + 10*86400000).toISOString(), createdAt: daysAgo(4) },
  { id: id(), title: 'Set up Stripe billing integration', status: 'open', priority: 'medium', assignee: 'Alex Johnson', project: 'AI-BOS Platform v2', dueDate: new Date(Date.now() + 21*86400000).toISOString(), createdAt: daysAgo(2) },
]);

write('departments/ops/okrs.json', [
  { id: id(), objective: 'Launch AI-BOS to first 10 paying customers', keyResults: [
    { text: 'Get 5 beta users signed up', progress: 40 },
    { text: 'Launch on Product Hunt', progress: 60 },
    { text: 'Close first paid deal', progress: 0 },
  ], owner: 'Sarah Chen', quarter: 'Q2 2026', status: 'on-track', createdAt: daysAgo(30) },
  { id: id(), objective: 'Achieve $50K MRR by end of Q2', keyResults: [
    { text: 'Close TechStart deal ($35K)', progress: 75 },
    { text: 'Close Global Media deal ($96K)', progress: 40 },
    { text: 'Collect overdue invoices', progress: 20 },
  ], owner: 'Marcus Williams', quarter: 'Q2 2026', status: 'at-risk', createdAt: daysAgo(30) },
]);

// ── Settings ───────────────────────────────────────────────────────────
write('settings.json', {
  workspaceName: 'AI-BOS Demo',
  industry: 'technology',
  companyDesc: 'AI-powered business operating system for modern teams',
  fiscalYear: '1',
  currency: 'USD',
  invoiceAlerts: true,
  emailFrom: 'noreply@getaibos.com',
  reportEmail: '',
});

console.log(`
✅ Seed data loaded successfully!

📊 What was added:
   👥 HR          — 5 employees
   💰 Finance     — 5 invoices + 7 ledger entries
   🎫 IT          — 6 tickets (1 critical!)
   📣 Marketing   — 4 campaigns
   💼 Sales       — 5 contacts + 5 deals ($217K pipeline)
   ⚖️  Legal       — 4 contracts + 3 risks
   ⚙️  Operations  — 3 projects + 6 tasks + 2 OKRs

🚀 Visit https://getaibos.com/dashboard to see it all live!

🗑️  To remove all seed data later: node seed.js --clear
`);
