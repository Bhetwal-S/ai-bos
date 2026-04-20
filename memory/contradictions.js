// memory/contradictions.js
// Detects conflicts between agent outputs and prior memory

import MemoryStore from './store.js';
import { MEMORY_TYPES } from './schema.js';

/**
 * Run all contradiction checks against a set of agent outputs
 * Returns array of contradiction strings (empty if none)
 */
export function detectContradictions(agentOutputs, command) {
  const contradictions = [];

  contradictions.push(...checkBudgetMismatch(agentOutputs));
  contradictions.push(...checkTimelineMismatch(agentOutputs));
  contradictions.push(...checkPriorDecisionConflict(agentOutputs, command));
  contradictions.push(...checkDuplicateLaunch(command));

  return contradictions;
}

function checkBudgetMismatch(outputs) {
  const finance = outputs.find(o => o.agent === 'finance')?.output || '';
  const devops  = outputs.find(o => o.agent === 'devops')?.output  || '';

  const finBudget  = extractDollarAmount(finance);
  const devopsCost = extractDollarAmount(devops);

  if (finBudget && devopsCost && devopsCost > finBudget * 1.3) {
    return [`Budget mismatch: Finance approved ~$${finBudget.toLocaleString()} but DevOps plan suggests ~$${devopsCost.toLocaleString()}. Requires CEO resolution.`];
  }
  return [];
}

function checkTimelineMismatch(outputs) {
  const timelines = outputs
    .map(o => ({ agent: o.agent, dates: extractTimelines(o.output) }))
    .filter(o => o.dates.length > 0);

  // Simple heuristic: flag if two agents mention very different week counts
  const weeks = timelines.map(t => t.dates).flat().filter(Boolean);
  if (weeks.length >= 2) {
    const min = Math.min(...weeks), max = Math.max(...weeks);
    if (max > min * 2) {
      return [`Timeline contradiction: agents are suggesting ${min}–${max} week ranges. Align timelines before proceeding.`];
    }
  }
  return [];
}

function checkPriorDecisionConflict(outputs, command) {
  const priorDecisions = MemoryStore.getRecent(10, MEMORY_TYPES.DECISION);
  const priorConstraints = MemoryStore.getRecent(10, MEMORY_TYPES.CONSTRAINT);

  for (const constraint of priorConstraints) {
    const budgetMatch = constraint.text.match(/\$[\d,]+/);
    if (budgetMatch) {
      const limit = parseDollar(budgetMatch[0]);
      for (const output of outputs) {
        const proposedCost = extractDollarAmount(output.output);
        if (proposedCost && proposedCost > limit * 1.2) {
          return [`Constraint violation: Prior constraint limits spending to ${budgetMatch[0]}, but ${output.agent} output suggests higher costs. CEO approval required.`];
        }
      }
    }
  }
  return [];
}

function checkDuplicateLaunch(command) {
  if (!command.toLowerCase().includes('launch')) return [];
  const priorLaunches = MemoryStore.getAll(MEMORY_TYPES.PROJECT)
    .filter(r => r.text.toLowerCase().includes('launch'));
  if (priorLaunches.length > 0) {
    return [`Duplicate launch detected: ${priorLaunches.length} prior launch project(s) in memory. Confirm this is a new initiative, not a duplicate.`];
  }
  return [];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractDollarAmount(text) {
  const matches = text.match(/\$\s*([\d,]+)\s*k?\b/gi) || [];
  const amounts = matches.map(m => {
    const raw = m.replace(/[$,\s]/g, '');
    const num = parseFloat(raw);
    return m.toLowerCase().includes('k') ? num * 1000 : num;
  }).filter(n => n > 100);
  return amounts.length ? Math.max(...amounts) : null;
}

function parseDollar(str) {
  return parseFloat(str.replace(/[$,]/g, '')) || 0;
}

function extractTimelines(text) {
  const matches = text.match(/(\d+)\s*weeks?/gi) || [];
  return matches.map(m => parseInt(m)).filter(n => n > 0 && n < 200);
}

export default { detectContradictions };
