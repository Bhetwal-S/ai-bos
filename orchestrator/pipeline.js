// orchestrator/pipeline.js
// The 5-stage orchestration pipeline: Receive → Load → Decompose → Execute → Synthesise

import Anthropic from '@anthropic-ai/sdk';
import { AGENTS, SYNTHESISER_PROMPT } from '../config/agents.config.js';
import MemoryStore from '../memory/store.js';
import { MEMORY_TYPES } from '../memory/schema.js';
import { detectContradictions } from '../memory/contradictions.js';
import { selectAgents } from './router.js';
import { learnFromRun, getContextBrief } from '../chief-ai/index.js';
import { KnowledgeStore } from '../chief-ai/knowledge-store.js';
import { scaffoldRepo } from '../integrations/github.js';
import { notifyPipelineComplete } from '../integrations/telegram.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Run the full 5-stage pipeline for a CEO command
 * @param {string} command - The CEO's natural language command
 * @param {function} onEvent - Callback for real-time pipeline events
 */
export async function runPipeline(command, onEvent = () => {}, options = {}) {
  const { whatIf = false, workspace = KnowledgeStore } = options;

  const sessionId = crypto.randomUUID();
  const results = { sessionId, command, whatIf, stages: {}, agentOutputs: [], contradictions: [], synthesis: '' };

  try {

    // ── Stage 1: RECEIVE ───────────────────────────────────────────
    onEvent({ stage: 'receive', status: 'active', whatIf });
    results.stages.receive = { status: 'done', command };
    if (!whatIf) MemoryStore.write(MEMORY_TYPES.CONTEXT, `CEO command received: ${command.substring(0, 100)}`, 'ceo');
    onEvent({ stage: 'receive', status: 'done' });

    // ── Stage 2: LOAD MEMORY ───────────────────────────────────────
    onEvent({ stage: 'load', status: 'active' });
    const contextPacket = MemoryStore.getContextPacket(8); // trimmed from 15 → 8
    const chiefBrief = getContextBrief();
    const basePrompt = buildBasePrompt(command, contextPacket, chiefBrief);

    const memoryResponse = await callAgent('memory', basePrompt);
    results.stages.load = { status: 'done', context: contextPacket, memoryResponse };
    onEvent({ stage: 'load', status: 'done', agent: 'memory', output: memoryResponse });

    // ── Stage 3: DECOMPOSE ─────────────────────────────────────────
    onEvent({ stage: 'decompose', status: 'active' });
    const orchResponse = await callAgent('orchestrator', basePrompt);
    const agentsToRun = selectAgents(command); // array of waves [[...], [...]]
    const agentsFlatList = agentsToRun.flat();
    results.stages.decompose = { status: 'done', agentsToRun: agentsFlatList, orchestratorPlan: orchResponse };
    onEvent({ stage: 'decompose', status: 'done', agent: 'orchestrator', output: orchResponse, agentsToRun: agentsFlatList });

    // ── Stage 4: EXECUTE (parallel waves) ─────────────────────────
    onEvent({ stage: 'execute', status: 'active' });

    for (const wave of agentsToRun) {
      // Fire all agents in this wave simultaneously
      onEvent({ stage: 'execute', wave, status: 'wave_start' });
      wave.forEach(agentId => onEvent({ stage: 'execute', agent: agentId, status: 'thinking' }));

      const waveResults = await Promise.all(
        wave.map(async (agentId) => {
          const agentPrompt = buildAgentPrompt(agentId, command, chiefBrief, contextPacket);
          const t0 = Date.now();
          const output = await callAgent(agentId, agentPrompt);
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          return { agent: agentId, output, elapsed };
        })
      );

      let pipelineBlocked = false;
      for (const { agent: agentId, output, elapsed } of waveResults) {
        const { text, confidence, block } = extractConfidence(output);
        results.agentOutputs.push({ agent: agentId, output: text });
        if (!whatIf) MemoryStore.write(MEMORY_TYPES.OUTCOME, `${agentId} output: ${text.substring(0, 120)}`, agentId);
        onEvent({ stage: 'execute', agent: agentId, status: 'done', output: text, confidence, elapsed });

        // Agent issued a BLOCK — halt pipeline immediately
        if (block) {
          const agentName = AGENTS[agentId]?.name || agentId;
          const blockMsg = `🚨 PIPELINE BLOCKED by ${agentName}: ${block}`;
          MemoryStore.write(MEMORY_TYPES.CONTRADICTION, blockMsg, agentId);
          onEvent({ stage: 'execute', type: 'block', agent: agentId, agentName, reason: block });
          results.blocked = { agent: agentId, agentName, reason: block };
          pipelineBlocked = true;
        }
      }

      if (pipelineBlocked) {
        const b = results.blocked;
        onEvent({ stage: 'blocked', agentName: b.agentName, reason: b.reason });
        return results;
      }

      // If architect ran in this wave, scaffold a GitHub repo (awaited so SSE is still open)
      const architectResult = waveResults.find(r => r.agent === 'architect');
      if (architectResult) {
        onEvent({ stage: 'execute', type: 'github', status: 'scaffolding' });
        try {
          const gh = await scaffoldRepo(command, architectResult.output);
          if (gh.ok) onEvent({ stage: 'execute', type: 'github', status: 'done', repoUrl: gh.repoUrl, repoName: gh.repoName });
          else onEvent({ stage: 'execute', type: 'github', status: 'failed', reason: gh.reason });
        } catch (e) {
          onEvent({ stage: 'execute', type: 'github', status: 'failed', reason: e.message });
        }
      }
    }

    onEvent({ stage: 'execute', status: 'done' });

    // ── Confidence threshold check ─────────────────────────────────
    const confidenceScores = results.agentOutputs
      .map(a => a.confidence)
      .filter(c => c !== null && c !== undefined);
    if (confidenceScores.length) {
      const avgConf = confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length;
      results.avgConfidence = parseFloat(avgConf.toFixed(1));
      if (avgConf < 6) {
        onEvent({ stage: 'execute', type: 'low_confidence', avgConfidence: results.avgConfidence,
          message: `Average agent confidence is ${results.avgConfidence}/10 — outputs may be unreliable. Consider adding more context to your command.` });
      }
    }

    // ── Stage 5: SYNTHESISE ────────────────────────────────────────
    onEvent({ stage: 'synthesise', status: 'active' });

    // Run contradiction detection before synthesis
    const contradictions = detectContradictions(results.agentOutputs, command);
    if (contradictions.length) {
      contradictions.forEach(c => {
        MemoryStore.write(MEMORY_TYPES.CONTRADICTION, c, 'memory');
        onEvent({ stage: 'synthesise', type: 'contradiction', message: c });
      });
      results.contradictions = contradictions;
    }

    const synthInput = buildSynthesisPrompt(command, results.agentOutputs);
    const synthesis = await callAgent('orchestrator', synthInput, SYNTHESISER_PROMPT, 500);
    results.synthesis = synthesis;

    if (!whatIf) {
      MemoryStore.write(MEMORY_TYPES.DECISION, `Command executed: ${command.substring(0, 100)}`, 'orchestrator', { sessionId });
      if (command.toLowerCase().includes('launch') || command.toLowerCase().includes('build') || command.toLowerCase().includes('plan')) {
        MemoryStore.write(MEMORY_TYPES.PROJECT, `Active project: ${command.substring(0, 80)}`, 'orchestrator', { sessionId });
      }
    }

    onEvent({ stage: 'synthesise', status: 'done', output: synthesis });
    results.stages.synthesise = { status: 'done' };

    // ── Skip learning + notifications in what-if mode ──────────
    if (whatIf) {
      onEvent({ stage: 'synthesise', status: 'done', output: synthesis, whatIf: true });
      results.stages.synthesise = { status: 'done' };
      return results;
    }

    // ── Persist to command history ─────────────────────────────
    const agentScores = {};
    results.agentOutputs.forEach(a => {
      if (a.confidence != null) agentScores[a.agent] = a.confidence;
    });
    workspace.addHistory({
      command,
      synthesis,
      agents: results.agentOutputs.map(a => a.agent),
      agentScores,
      avgConfidence: results.avgConfidence || null,
      contradictions: results.contradictions.length,
      blocked: results.blocked?.agent || null,
      sessionId,
    });

    // ── Generate smart follow-up suggestions (non-blocking) ───
    generateSuggestions(command, synthesis, results.agentOutputs).then(suggestions => {
      if (suggestions.length) {
        results.suggestions = suggestions;
        onEvent({ stage: 'suggestions', suggestions });
      }
    }).catch(() => {});

    // ── Chief AI: learn from this run (non-blocking) ───────────
    learnFromRun(command, results.agentOutputs, synthesis).catch(() => {});

    // ── Telegram notification ──────────────────────────────────
    notifyPipelineComplete({
      command,
      synthesis,
      agentOutputs: results.agentOutputs,
      contradictions: results.contradictions,
      repoUrl: results.repoUrl || null,
    }).catch(() => {});

  } catch (error) {
    onEvent({ stage: 'error', message: error.message });
    results.error = error.message;
  }

  return results;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function callAgent(agentId, userMessage, overrideSystem = null, overrideTokens = null) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  const systemPrompt = overrideSystem || agent.systemPrompt;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: overrideTokens || agent.maxTokens || 400,
    // Cache system prompts — they never change, saves tokens on every call
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content[0]?.text || '';
}

const PERSONA_DIRECTIVES = {
  aggressive: 'Company style: AGGRESSIVE GROWTH. Prioritise speed and market capture over caution. Recommend bold moves, accept higher risk, bias toward action. Flag slow/conservative options as suboptimal.',
  balanced:   'Company style: BALANCED. Weigh speed against risk evenly. Give practical, grounded recommendations with clear tradeoffs.',
  conservative: 'Company style: CONSERVATIVE. Prioritise stability, compliance, and risk mitigation over speed. Flag speculative or high-risk approaches as warnings.',
};

function getPersonaDirective() {
  const profile = KnowledgeStore.getProfile(); // uses default for persona directive
  return PERSONA_DIRECTIVES[profile.persona] || PERSONA_DIRECTIVES.balanced;
}

// Base prompt for orchestrator + memory (they need full context)
function buildBasePrompt(command, contextPacket, chiefBrief) {
  const parts = [`CEO Command: "${command}"`];
  parts.push(getPersonaDirective());
  if (chiefBrief)    parts.push(`Company context:\n${chiefBrief}`);
  if (contextPacket) parts.push(`Session memory:\n${contextPacket}`);
  if (!chiefBrief && !contextPacket) parts.push('No prior context.');
  return parts.join('\n\n');
}

// Per-agent prompt — only inject context fields the agent actually needs
function buildAgentPrompt(agentId, command, chiefBrief, contextPacket) {
  const agent = AGENTS[agentId];
  const fields = agent.contextFields || [];
  const parts = [`CEO Command: "${command}"`, getPersonaDirective()];

  if (chiefBrief && fields.length) {
    const lines = chiefBrief.split('\n').filter(line => {
      return fields.some(f => line.toLowerCase().includes(f.replace('_', ' ')));
    });
    if (lines.length) parts.push(`Relevant company context:\n${lines.join('\n')}`);
  }

  // Only include recent decisions/constraints from session memory (trimmed)
  if (contextPacket && (fields.includes('decisions') || fields.includes('constraints'))) {
    const memLines = contextPacket.split('\n')
      .filter(l => l.includes('[decision]') || l.includes('[constraint]'))
      .slice(-3);
    if (memLines.length) parts.push(`Recent decisions/constraints:\n${memLines.join('\n')}`);
  }

  return parts.join('\n\n');
}

function extractConfidence(output) {
  const confMatch  = output.match(/CONFIDENCE:\s*(\d+)\/10\s*$/im);
  const blockMatch = output.match(/^BLOCK:\s*(.+)$/im);
  const confidence = confMatch ? parseInt(confMatch[1]) : null;
  const block      = blockMatch ? blockMatch[1].trim() : null;
  const text = output
    .replace(/\nBLOCK:\s*.+$/im, '')
    .replace(/\nCONFIDENCE:\s*\d+\/10\s*$/im, '')
    .trim();
  return { text, confidence, block };
}

async function generateSuggestions(command, synthesis, agentOutputs) {
  const risks = agentOutputs
    .map(a => `[${a.agent}]: ${a.output?.slice(0, 200)}`)
    .join('\n');

  const prompt = `You are an AI Business OS assistant. A CEO just ran this command:
"${command}"

The executive synthesis was:
${synthesis?.slice(0, 600)}

Key agent outputs (risks/next actions flagged):
${risks}

Generate exactly 3 sharp follow-up commands the CEO should run next, based on unresolved risks, flagged actions, or logical next steps.
Return ONLY a JSON array of 3 strings — each a natural language command under 15 words. No markdown, no explanation.
Example: ["Hire a security lead to address the SOC2 gap", "Build a pricing model for enterprise tier", "Draft contracts for the founding team"]`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text?.trim() || '[]';
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch { return []; }
}

function buildSynthesisPrompt(command, agentOutputs) {
  const outputs = agentOutputs.map(a => `[${a.agent.toUpperCase()}]:\n${a.output}`).join('\n\n');
  return `CEO Command: "${command}"\n\nAgent outputs:\n${outputs}`;
}

export default { runPipeline };
