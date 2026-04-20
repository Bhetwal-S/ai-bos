// chief-ai/chat.js
// CEO Chat mode — multi-turn conversation with the full agent team

import Anthropic from '@anthropic-ai/sdk';
import { KnowledgeStore } from './knowledge-store.js';
import { AGENTS } from '../config/agents.config.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory session store (keyed by sessionId)
const sessions = new Map();

const CHAT_SYSTEM = `You are the AI-BOS Command Intelligence — the conversational interface between the CEO and a team of 9 specialist AI agents (Architect, HR, DevOps, Security, Marketing, Finance, Legal, Memory, Orchestrator).

Your job:
1. Understand what the CEO is asking or saying
2. Decide which agent(s) should respond (or respond yourself if it's a general question)
3. Route the message, gather responses, and present them clearly
4. Remember the full conversation context — refer back to prior messages naturally
5. If the CEO refines something ("actually make it cheaper", "change the timeline"), update accordingly and re-run only the affected agents

Respond in this format:
- If routing to agents: brief acknowledgement, then agent responses clearly labelled
- If answering yourself: direct answer
- Always end with a follow-up prompt or action suggestion

Be conversational, sharp, and CEO-friendly. No filler.`;

// ── Select agents relevant to a chat message ──────────────────────
function selectAgentsForChat(message, history) {
  const c = message.toLowerCase();
  const agentKeywords = {
    architect:  ['architect', 'tech', 'system', 'api', 'code', 'stack', 'database', 'backend', 'frontend', 'build'],
    hr:         ['hire', 'team', 'people', 'recruit', 'onboard', 'headcount', 'staff'],
    devops:     ['infra', 'deploy', 'aws', 'cloud', 'ci/cd', 'server', 'docker'],
    security:   ['security', 'threat', 'compliance', 'gdpr', 'soc2', 'audit', 'vulnerability'],
    marketing:  ['market', 'campaign', 'brand', 'launch', 'growth', 'content', 'seo'],
    finance:    ['cost', 'budget', 'money', 'roi', 'spend', 'revenue', 'price', 'cheaper', 'expensive'],
    legal:      ['legal', 'contract', 'liability', 'gdpr', 'privacy', 'compliance', 'law'],
  };

  const selected = new Set();
  for (const [agent, keywords] of Object.entries(agentKeywords)) {
    if (keywords.some(kw => c.includes(kw))) selected.add(agent);
  }

  // If refining a prior response, include the same agents as last time
  if (['actually', 'change', 'update', 'make it', 'instead', 'revise', 'adjust'].some(w => c.includes(w))) {
    const lastAgents = history.filter(h => h.role === 'assistant' && h.agents)
      .slice(-1)[0]?.agents || [];
    lastAgents.forEach(a => selected.add(a));
  }

  return [...selected].slice(0, 4); // cap at 4 agents per chat turn
}

// ── Call a single agent for chat ───────────────────────────────────
async function callAgentForChat(agentId, message, conversationHistory) {
  const agent = AGENTS[agentId];
  if (!agent) return null;

  const historyText = conversationHistory
    .slice(-6)
    .map(h => `${h.role === 'user' ? 'CEO' : 'AI-BOS'}: ${h.content}`)
    .join('\n');

  const prompt = `Conversation so far:
${historyText}

CEO's latest message: "${message}"

Respond as the ${agent.name} Agent. Be concise and directly address what the CEO said. Max 80 words.
End with: CONFIDENCE: X/10`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 350,
    system: [{ type: 'text', text: agent.systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0]?.text || '';
}

// ── Main chat handler ──────────────────────────────────────────────
export async function chat(sessionId, message) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { history: [], createdAt: new Date().toISOString() });
  }

  const session = sessions.get(sessionId);
  const { history } = session;

  // Add user message to history
  history.push({ role: 'user', content: message });

  // Get company context
  const profile = KnowledgeStore.getProfile();
  const decisions = KnowledgeStore.getDecisions(3).map(d => d.text).join('; ');
  const contextNote = profile.name || profile.industry
    ? `Company: ${profile.name || 'unnamed'} | Industry: ${profile.industry || 'unknown'} | Recent decisions: ${decisions || 'none'}`
    : '';

  // Decide which agents to involve
  const agentsToCall = selectAgentsForChat(message, history);

  let responseText = '';

  if (agentsToCall.length === 0) {
    // No specific agents — Chief AI answers directly
    const historyMsgs = history.slice(-8).map(h => ({
      role: h.role,
      content: h.content,
    }));

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: [{ type: 'text', text: CHAT_SYSTEM + (contextNote ? `\n\nCompany context: ${contextNote}` : ''), cache_control: { type: 'ephemeral' } }],
      messages: historyMsgs,
    });
    responseText = response.content[0]?.text || '';
  } else {
    // Call relevant agents in parallel
    const agentResponses = await Promise.all(
      agentsToCall.map(async agentId => {
        const output = await callAgentForChat(agentId, message, history);
        return { agent: agentId, output };
      })
    );

    // Build combined response
    const agentBlocks = agentResponses
      .filter(r => r.output)
      .map(r => {
        const name = AGENTS[r.agent]?.name || r.agent;
        const color = AGENTS[r.agent]?.color || '#6366f1';
        const text = r.output.replace(/\nCONFIDENCE:\s*\d+\/10\s*$/im, '').trim();
        return { name, color, text, agent: r.agent };
      });

    responseText = agentBlocks.map(b => `[${b.name}]\n${b.text}`).join('\n\n');
    session.lastAgents = agentsToCall;

    // Store agents for refinement tracking
    history[history.length - 1].agents = agentsToCall;
  }

  // Add assistant response to history
  history.push({ role: 'assistant', content: responseText });

  // Keep history to last 20 turns
  if (history.length > 40) history.splice(0, 2);

  return {
    response: responseText,
    agents: agentsToCall,
    sessionId,
  };
}

// ── Get session history ────────────────────────────────────────────
export function getChatHistory(sessionId) {
  return sessions.get(sessionId)?.history || [];
}

// ── Clear session ──────────────────────────────────────────────────
export function clearChatSession(sessionId) {
  sessions.delete(sessionId);
}

export default { chat, getChatHistory, clearChatSession };
