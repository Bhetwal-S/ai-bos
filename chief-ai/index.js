// chief-ai/index.js
// The Company AI — learns from every pipeline run, answers questions, briefs agents

import Anthropic from '@anthropic-ai/sdk';
import { KnowledgeStore } from './knowledge-store.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CHIEF_SYSTEM = `You are the Company AI — the institutional memory and learning brain of this organisation.
You observe every decision, extract patterns, update the company profile, and answer questions about the company's direction, history, and strategy.
You are precise, factual, and direct. You never hallucinate — if you don't know something, say so.
You speak in bullet points and structured output only.`;

// ── Learn from a completed pipeline run ───────────────────────────
export async function learnFromRun(command, agentOutputs, synthesis) {
  const context = KnowledgeStore.getFullContext();

  const prompt = `You just observed a completed AI pipeline run. Extract structured learnings.

CEO Command: "${command}"

Agent outputs:
${agentOutputs.map(a => `[${a.agent.toUpperCase()}]: ${a.output}`).join('\n\n')}

Executive Synthesis:
${synthesis}

Existing company knowledge:
${context}

Return a JSON object with exactly this structure (no markdown, raw JSON only):
{
  "profile_updates": {
    "name": "company name if mentioned or null",
    "industry": "industry if mentioned or null",
    "stage": "startup/growth/enterprise if inferable or null",
    "tech_stack": ["any specific tools/technologies mentioned"],
    "budget_ceiling": null or number,
    "team_size": null or number,
    "preferences": ["any CEO preferences or standards mentioned"],
    "constraints": ["any hard limits or constraints mentioned"]
  },
  "decisions": [
    { "category": "tech|hr|finance|security|marketing|ops", "text": "one-line decision made" }
  ],
  "lessons": [
    { "category": "tech|hr|finance|security|marketing|ops|process", "insight": "pattern or lesson learned" }
  ]
}

Only include non-null, non-empty values. Decisions and lessons arrays can be empty if nothing notable.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: CHIEF_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0]?.text?.trim() || '{}';
    // Strip markdown code fences if present
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const data = JSON.parse(clean);

    // Apply learnings
    const profileUpdates = {};
    const pu = data.profile_updates || {};
    if (pu.name)           profileUpdates.name = pu.name;
    if (pu.industry)       profileUpdates.industry = pu.industry;
    if (pu.stage)          profileUpdates.stage = pu.stage;
    if (pu.budget_ceiling) profileUpdates.budget_ceiling = pu.budget_ceiling;
    if (pu.team_size)      profileUpdates.team_size = pu.team_size;
    if (pu.tech_stack?.length)  profileUpdates.tech_stack = pu.tech_stack;
    if (pu.preferences?.length) profileUpdates.preferences = pu.preferences;
    if (pu.constraints?.length) profileUpdates.constraints = pu.constraints;
    if (Object.keys(profileUpdates).length) KnowledgeStore.updateProfile(profileUpdates);

    (data.decisions || []).forEach(d => d.text && KnowledgeStore.addDecision(d));
    (data.lessons   || []).forEach(l => l.insight && KnowledgeStore.addLesson(l));

    KnowledgeStore.upsertProject(command, synthesis);

    return { ok: true, learned: data };
  } catch (err) {
    console.error('[ChiefAI] learn error:', err.message);
    return { ok: false, error: err.message };
  }
}

// ── Answer a direct question about the company ─────────────────────
export async function query(question) {
  const context = KnowledgeStore.getFullContext();

  const prompt = `The CEO is asking you a direct question about the company.

Company knowledge base:
${context}

CEO question: "${question}"

Answer concisely and factually based only on what you know from the knowledge base.
If the answer isn't in the knowledge base, say "I don't have that information yet — run more pipeline commands to build this knowledge."`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    system: CHIEF_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0]?.text || '';
}

// ── Generate a context brief to inject into pipeline runs ──────────
export function getContextBrief() {
  const profile   = KnowledgeStore.getProfile();
  const decisions = KnowledgeStore.getDecisions(5);
  const lessons   = KnowledgeStore.getLessons(5);
  const constraints = profile.constraints || [];

  if (!decisions.length && !lessons.length && !constraints.length) return null;

  const lines = [];
  if (profile.name)          lines.push(`Company: ${profile.name}`);
  if (profile.industry)      lines.push(`Industry: ${profile.industry}`);
  if (profile.tech_stack?.length) lines.push(`Tech stack: ${profile.tech_stack.join(', ')}`);
  if (profile.budget_ceiling) lines.push(`Budget ceiling: $${profile.budget_ceiling.toLocaleString()}`);
  if (constraints.length)    lines.push(`Constraints: ${constraints.join('; ')}`);
  if (decisions.length)      lines.push(`Recent decisions: ${decisions.map(d => d.text).join(' | ')}`);
  if (lessons.length)        lines.push(`Lessons learned: ${lessons.map(l => l.insight).join(' | ')}`);

  return lines.join('\n');
}

// ── Surface recurring patterns across all runs ─────────────────────
export async function surfacePatterns() {
  const lessons   = KnowledgeStore.getLessons(50);
  const decisions = KnowledgeStore.getDecisions(50);
  const projects  = KnowledgeStore.getProjects(10);

  if (lessons.length < 2 && decisions.length < 2) {
    return { patterns: [], insight: 'Not enough history yet. Run more pipeline commands to surface patterns.' };
  }

  const prompt = `You are the Company AI analysing patterns across all pipeline runs.

Lessons learned so far (${lessons.length}):
${lessons.map(l => `[${l.category}] ${l.insight}`).join('\n')}

Decisions made so far (${decisions.length}):
${decisions.map(d => `[${d.category}] ${d.text}`).join('\n')}

Projects run (${projects.length}):
${projects.map(p => `"${p.command}"`).join('\n')}

Identify 3-5 meaningful patterns, trends, or risks that keep appearing.
Return JSON only:
{
  "patterns": [
    { "category": "finance|hr|tech|security|marketing|ops", "title": "short title", "insight": "1-2 sentence pattern description", "severity": "info|warning|critical" }
  ]
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: CHIEF_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = response.content[0]?.text?.trim() || '{}';
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    return { patterns: [], error: err.message };
  }
}

export default { learnFromRun, query, getContextBrief, surfacePatterns };
