// orchestrator/scheduler.js
// Autonomous scheduled runs — CEO sets recurring commands, system executes them on cron

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runPipeline } from './pipeline.js';
import { notify } from '../integrations/telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULES_FILE = path.resolve(__dirname, '../knowledge/schedules.json');

// ── Storage ────────────────────────────────────────────────────────
function loadSchedules() {
  try {
    if (!fs.existsSync(SCHEDULES_FILE)) return [];
    return JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf-8'));
  } catch { return []; }
}

function saveSchedules(schedules) {
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
}

// ── CRUD ───────────────────────────────────────────────────────────
export function addSchedule({ command, cronLabel, intervalMs, description }) {
  const schedules = loadSchedules();
  const schedule = {
    id: crypto.randomUUID(),
    command,
    cronLabel,       // human label e.g. "Every Monday"
    intervalMs,      // ms between runs
    description,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastRun: null,
    nextRun: new Date(Date.now() + intervalMs).toISOString(),
    runCount: 0,
  };
  schedules.push(schedule);
  saveSchedules(schedules);
  return schedule;
}

export function removeSchedule(id) {
  const schedules = loadSchedules().filter(s => s.id !== id);
  saveSchedules(schedules);
}

export function toggleSchedule(id, enabled) {
  const schedules = loadSchedules();
  const s = schedules.find(s => s.id === id);
  if (s) { s.enabled = enabled; saveSchedules(schedules); }
}

export function getSchedules() {
  return loadSchedules();
}

// ── Tick — check and fire due schedules ───────────────────────────
async function tick() {
  const schedules = loadSchedules();
  const now = Date.now();
  let changed = false;

  for (const s of schedules) {
    if (!s.enabled) continue;
    if (new Date(s.nextRun).getTime() > now) continue;

    console.log(`[Scheduler] Running scheduled command: "${s.command}"`);

    // Update before running
    s.lastRun = new Date().toISOString();
    s.nextRun = new Date(now + s.intervalMs).toISOString();
    s.runCount = (s.runCount || 0) + 1;
    changed = true;

    // Notify on Telegram that scheduled run is starting
    notify(`🕐 <b>Scheduled run starting</b>\n\n📋 ${s.command}\n🔁 ${s.cronLabel} (run #${s.runCount})`).catch(() => {});

    // Run pipeline (non-blocking per schedule)
    runPipeline(s.command).then(result => {
      console.log(`[Scheduler] Completed: "${s.command}"`);
    }).catch(err => {
      console.error(`[Scheduler] Failed: "${s.command}"`, err.message);
      notify(`❌ <b>Scheduled run failed</b>\n\n📋 ${s.command}\n\nError: ${err.message}`).catch(() => {});
    });
  }

  if (changed) saveSchedules(schedules);
}

// ── Start the scheduler loop ───────────────────────────────────────
export function startScheduler() {
  // Check every minute
  setInterval(tick, 60_000);
  tick(); // also run immediately on startup
  console.log('[Scheduler] Running — checking schedules every minute');
}

// ── Preset intervals ───────────────────────────────────────────────
export const INTERVALS = {
  '15min':   { ms: 15 * 60 * 1000,           label: 'Every 15 minutes' },
  'hourly':  { ms: 60 * 60 * 1000,           label: 'Every hour' },
  'daily':   { ms: 24 * 60 * 60 * 1000,      label: 'Every day' },
  'weekly':  { ms: 7 * 24 * 60 * 60 * 1000,  label: 'Every week' },
  'monthly': { ms: 30 * 24 * 60 * 60 * 1000, label: 'Every month' },
};

export default { addSchedule, removeSchedule, toggleSchedule, getSchedules, startScheduler, INTERVALS };
