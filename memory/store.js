// memory/store.js
// Persistent memory store — reads/writes to local JSON file
// Drop-in replaceable with a database in Phase 2

import fs from 'fs';
import path from 'path';
import { createRecord, MEMORY_TYPES } from './schema.js';

const MEMORY_FILE = path.resolve('./memory/memory.log.json');

function load() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function save(records) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(records, null, 2));
}

export const MemoryStore = {

  /** Write a new memory record */
  write(type, text, agentSource = 'system', detail = {}) {
    const records = load();
    const record = createRecord(type, text, agentSource, detail);
    records.push(record);
    save(records);
    return record;
  },

  /** Get all records, optionally filtered by type */
  getAll(type = null) {
    const records = load();
    return type ? records.filter(r => r.type === type) : records;
  },

  /** Get recent N records, optionally filtered by type */
  getRecent(n = 20, type = null) {
    return this.getAll(type).slice(-n);
  },

  /** Get context packet for an agent — most relevant recent memories */
  getContextPacket(n = 15) {
    const all = load();
    // Prioritise: decisions > constraints > projects > rest
    const priority = [
      ...all.filter(r => r.type === MEMORY_TYPES.DECISION).slice(-5),
      ...all.filter(r => r.type === MEMORY_TYPES.CONSTRAINT).slice(-5),
      ...all.filter(r => r.type === MEMORY_TYPES.PROJECT).slice(-3),
      ...all.filter(r => r.type === MEMORY_TYPES.CONTRADICTION && r.status !== 'resolved').slice(-3),
      ...all.filter(r => r.type === MEMORY_TYPES.PREFERENCE).slice(-3),
    ];
    const seen = new Set(priority.map(r => r.record_id));
    const rest = all.filter(r => !seen.has(r.record_id)).slice(-5);
    return [...priority, ...rest].slice(-n).map(r => `[${r.type}] ${r.text}`).join('\n');
  },

  /** Mark a record as superseded */
  supersede(recordId) {
    const records = load();
    const rec = records.find(r => r.record_id === recordId);
    if (rec) { rec.status = 'superseded'; save(records); }
  },

  /** Get total count */
  count() { return load().length; },

  /** Clear all memory (use with caution) */
  clear() { save([]); },
};

export default MemoryStore;
