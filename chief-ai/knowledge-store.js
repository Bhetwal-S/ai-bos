// chief-ai/knowledge-store.js
// Workspace-aware knowledge store — each workspace has its own isolated directory

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_KNOWLEDGE = path.resolve(__dirname, '../knowledge');
const WORKSPACES_FILE = path.join(ROOT_KNOWLEDGE, 'workspaces.json');

const FILES = {
  profile:   'company-profile.json',
  decisions: 'decisions.json',
  lessons:   'lessons.json',
  projects:  'projects.json',
  history:   'command-history.json',
};

// ── Workspace registry ────────────────────────────────────────────
export const WorkspaceRegistry = {
  getAll() {
    try { return JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf-8')); }
    catch { return [{ id: 'default', name: 'My Company', slug: 'default', color: '#6366f1', created: new Date().toISOString() }]; }
  },

  get(id) { return this.getAll().find(w => w.id === id) || null; },

  create({ name, color = '#6366f1' }) {
    const workspaces = this.getAll();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = `${slug}-${Date.now()}`;
    const ws = { id, name, slug, color, created: new Date().toISOString() };
    workspaces.push(ws);
    fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(workspaces, null, 2));
    // Bootstrap empty files for this workspace
    KnowledgeStore.for(id)._bootstrap();
    return ws;
  },

  delete(id) {
    if (id === 'default') throw new Error('Cannot delete default workspace');
    const workspaces = this.getAll().filter(w => w.id !== id);
    fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(workspaces, null, 2));
    const dir = path.join(ROOT_KNOWLEDGE, 'workspaces', id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  },
};

// ── KnowledgeStore factory ────────────────────────────────────────
function makeStore(workspaceId = 'default') {
  // Default workspace uses the root knowledge/ dir for backwards compat
  const dir = workspaceId === 'default'
    ? ROOT_KNOWLEDGE
    : path.join(ROOT_KNOWLEDGE, 'workspaces', workspaceId);

  function read(file) {
    try {
      const p = path.join(dir, file);
      if (!fs.existsSync(p)) return file === FILES.profile ? {} : [];
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch { return file === FILES.profile ? {} : []; }
  }

  function write(file, data) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
  }

  return {
    workspaceId,

    _bootstrap() {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      Object.entries(FILES).forEach(([, file]) => {
        const p = path.join(dir, file);
        if (!fs.existsSync(p)) {
          fs.writeFileSync(p, file === FILES.profile ? '{}' : '[]');
        }
      });
    },

    // ── Profile ────────────────────────────────────────────────
    getProfile() { return read(FILES.profile); },

    updateProfile(updates) {
      const profile = read(FILES.profile);
      const merged = { ...profile, ...updates, last_updated: new Date().toISOString() };
      if (updates.tech_stack)   merged.tech_stack   = [...new Set([...(profile.tech_stack||[]),   ...updates.tech_stack])];
      if (updates.preferences)  merged.preferences  = [...new Set([...(profile.preferences||[]),  ...updates.preferences])];
      if (updates.constraints)  merged.constraints  = [...new Set([...(profile.constraints||[]),  ...updates.constraints])];
      write(FILES.profile, merged);
      return merged;
    },

    // ── Decisions ──────────────────────────────────────────────
    getDecisions(limit = 20) { return read(FILES.decisions).slice(-limit); },

    addDecision(decision) {
      const decisions = read(FILES.decisions);
      decisions.push({ ...decision, id: crypto.randomUUID(), timestamp: new Date().toISOString() });
      write(FILES.decisions, decisions);
    },

    // ── Lessons ────────────────────────────────────────────────
    getLessons(limit = 20) { return read(FILES.lessons).slice(-limit); },

    addLesson(lesson) {
      const lessons = read(FILES.lessons);
      const duplicate = lessons.some(l =>
        l.category === lesson.category &&
        l.insight?.toLowerCase().slice(0, 40) === lesson.insight?.toLowerCase().slice(0, 40)
      );
      if (!duplicate) {
        lessons.push({ ...lesson, id: crypto.randomUUID(), timestamp: new Date().toISOString() });
        write(FILES.lessons, lessons);
      }
    },

    // ── Projects ───────────────────────────────────────────────
    getProjects(limit = 20) { return read(FILES.projects).slice(0, limit); },
    getProject(id) { return read(FILES.projects).find(p => p.id === id) || null; },

    upsertProject(command, synthesis) {
      const projects = read(FILES.projects);
      const existing = projects.find(p => p.command === command);
      if (existing) {
        existing.synthesis = synthesis;
        existing.lastRun = new Date().toISOString();
        existing.updated = new Date().toISOString();
        existing.runCount = (existing.runCount || 1) + 1;
      } else {
        projects.unshift({
          id: crypto.randomUUID(), command,
          title: command.length > 60 ? command.slice(0, 57) + '…' : command,
          synthesis, status: 'planning', progress: 0, milestones: [], notes: '',
          runCount: 1, created: new Date().toISOString(),
          lastRun: new Date().toISOString(), updated: new Date().toISOString(),
        });
      }
      write(FILES.projects, projects);
      return projects.find(p => p.command === command);
    },

    updateProject(id, updates) {
      const projects = read(FILES.projects);
      const idx = projects.findIndex(p => p.id === id);
      if (idx === -1) return null;
      projects[idx] = { ...projects[idx], ...updates, updated: new Date().toISOString() };
      write(FILES.projects, projects);
      return projects[idx];
    },

    deleteProject(id) { write(FILES.projects, read(FILES.projects).filter(p => p.id !== id)); },

    addMilestone(projectId, text) {
      const projects = read(FILES.projects);
      const proj = projects.find(p => p.id === projectId);
      if (!proj) return null;
      proj.milestones = proj.milestones || [];
      proj.milestones.push({ id: crypto.randomUUID(), text, done: false, created: new Date().toISOString() });
      proj.updated = new Date().toISOString();
      write(FILES.projects, projects);
      return proj;
    },

    toggleMilestone(projectId, milestoneId) {
      const projects = read(FILES.projects);
      const proj = projects.find(p => p.id === projectId);
      if (!proj) return null;
      const ms = (proj.milestones || []).find(m => m.id === milestoneId);
      if (ms) ms.done = !ms.done;
      const total = proj.milestones.length;
      proj.progress = total ? Math.round((proj.milestones.filter(m => m.done).length / total) * 100) : proj.progress;
      proj.updated = new Date().toISOString();
      write(FILES.projects, projects);
      return proj;
    },

    // ── History ────────────────────────────────────────────────
    addHistory(entry) {
      const history = read(FILES.history);
      history.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry });
      write(FILES.history, history.slice(0, 200));
    },

    getHistory({ limit = 50, search = '' } = {}) {
      const history = read(FILES.history);
      if (!search) return history.slice(0, limit);
      const q = search.toLowerCase();
      return history.filter(h =>
        h.command?.toLowerCase().includes(q) ||
        h.synthesis?.toLowerCase().includes(q) ||
        h.agents?.some(a => a.toLowerCase().includes(q))
      ).slice(0, limit);
    },

    _writeHistory(data) { write(FILES.history, data); },

    getAgentPerformance() {
      const history = read(FILES.history);
      const stats = {};
      history.forEach(run => {
        const scores = run.agentScores || {};
        (run.agents || []).forEach(agent => {
          if (!stats[agent]) stats[agent] = { runs: 0, totalConf: 0, confCount: 0, blocks: 0, contradictionRuns: 0 };
          stats[agent].runs++;
          if (scores[agent] != null) { stats[agent].totalConf += scores[agent]; stats[agent].confCount++; }
          if (run.blocked === agent) stats[agent].blocks++;
          if (run.contradictions > 0) stats[agent].contradictionRuns++;
        });
      });
      return Object.entries(stats).map(([agent, s]) => {
        const avgConf = s.confCount > 0 ? parseFloat((s.totalConf / s.confCount).toFixed(1)) : null;
        const confScore    = avgConf != null ? (avgConf / 10) * 60 : 30;
        const blockPenalty = Math.min(s.blocks * 20, 40);
        const reliability  = s.runs > 0 ? ((s.runs - s.contradictionRuns) / s.runs) * 40 : 40;
        const score = Math.max(0, Math.min(100, Math.round(confScore - blockPenalty + reliability)));
        return { agent, runs: s.runs, avgConf, blocks: s.blocks, score };
      }).sort((a, b) => b.score - a.score);
    },

    // ── Full context for Chief AI ───────────────────────────────
    getFullContext() {
      const profile   = read(FILES.profile);
      const decisions = read(FILES.decisions).slice(-10);
      const lessons   = read(FILES.lessons).slice(-10);
      const projects  = read(FILES.projects).slice(-5);
      return `COMPANY PROFILE:\n${JSON.stringify(profile, null, 2)}\n\nRECENT DECISIONS (last 10):\n${decisions.map(d => `- [${d.category}] ${d.text}`).join('\n') || 'None yet.'}\n\nLESSONS LEARNED (last 10):\n${lessons.map(l => `- [${l.category}] ${l.insight}`).join('\n') || 'None yet.'}\n\nACTIVE PROJECTS (last 5):\n${projects.map(p => `- "${p.command}" (${p.created?.slice(0,10)})`).join('\n') || 'None yet.'}`;
    },
  };
}

// ── Default singleton (backwards compat) ──────────────────────────
export const KnowledgeStore = makeStore('default');

// ── Workspace-scoped factory ──────────────────────────────────────
KnowledgeStore.for = (workspaceId) => makeStore(workspaceId || 'default');

export default KnowledgeStore;
