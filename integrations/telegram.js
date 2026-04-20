// integrations/telegram.js
// Sends pipeline summaries to a Telegram chat via bot

const BASE = 'https://api.telegram.org';

async function send(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, reason: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID' };

  const res = await fetch(`${BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return res.json();
}

// ── Format and send a pipeline summary ────────────────────────────
export async function notifyPipelineComplete({ command, synthesis, agentOutputs, contradictions, repoUrl }) {
  // Extract first 5 lines of synthesis for the message
  const summaryLines = synthesis
    .split('\n')
    .filter(l => l.trim())
    .slice(0, 8)
    .join('\n');

  const agents = agentOutputs.map(a => a.agent).join(', ');
  const contradictionLine = contradictions?.length
    ? `\n⚠️ <b>${contradictions.length} contradiction(s) flagged</b>`
    : '\n✅ No contradictions';
  const repoLine = repoUrl ? `\n📁 <a href="${repoUrl}">GitHub repo created</a>` : '';

  const msg =
`⚡ <b>AI-BOS Pipeline Complete</b>

📋 <b>Command:</b> ${command}

🤖 <b>Agents run:</b> ${agents}
${contradictionLine}${repoLine}

📊 <b>Summary:</b>
${summaryLines}`;

  return send(msg);
}

// ── Send a simple text alert ───────────────────────────────────────
export async function notify(text) {
  return send(`⚡ <b>AI-BOS</b>\n\n${text}`);
}

export default { notifyPipelineComplete, notify };
