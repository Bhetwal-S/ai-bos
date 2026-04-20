// orchestrator/router.js
// Selects agents and groups them into parallel execution waves

import { AGENTS } from '../config/agents.config.js';

const SPECIALIST_AGENTS = ['architect', 'hr', 'devops', 'security', 'marketing', 'finance', 'legal'];

// Dependency graph — agent can only run after all its deps complete
const DEPS = {
  architect: [],
  hr:        [],
  marketing: [],
  legal:     [],
  devops:    ['architect'],
  security:  ['devops'],
  finance:   ['architect', 'devops', 'security', 'hr', 'marketing', 'legal'],
};

/**
 * Select agents for a command and return them as ordered parallel waves.
 * Each wave is an array of agent IDs that can run simultaneously.
 */
export function selectAgents(command) {
  const c = command.toLowerCase();
  const selected = new Set();

  for (const agentId of SPECIALIST_AGENTS) {
    const agent = AGENTS[agentId];
    if (agent.keywords?.some(kw => c.includes(kw))) selected.add(agentId);
  }

  if (['launch', 'plan', 'build', 'create', 'start', 'deploy'].some(w => c.includes(w))) {
    selected.add('finance');
  }
  if (selected.has('devops') || selected.has('architect')) {
    selected.add('security');
  }
  if (['data', 'user', 'gdpr', 'privacy', 'launch', 'hire', 'contract', 'incorporate'].some(w => c.includes(w))) {
    selected.add('legal');
  }
  if (selected.size === 0) {
    selected.add('architect');
    selected.add('finance');
  }

  return buildWaves([...selected]);
}

/**
 * Group selected agents into sequential waves of parallel runners.
 * Wave N only starts after all agents in wave N-1 are done.
 */
export function buildWaves(agentIds) {
  const set = new Set(agentIds);
  const waves = [];
  const done = new Set();

  while (done.size < set.size) {
    const wave = agentIds.filter(id =>
      !done.has(id) &&
      (DEPS[id] || []).filter(dep => set.has(dep)).every(dep => done.has(dep))
    );
    if (!wave.length) break; // safety: prevent infinite loop on bad deps
    waves.push(wave);
    wave.forEach(id => done.add(id));
  }

  return waves;
}

export default { selectAgents, buildWaves };
