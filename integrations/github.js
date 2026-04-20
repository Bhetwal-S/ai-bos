// integrations/github.js
// GitHub REST API integration — create repos, push scaffold files

import Anthropic from '@anthropic-ai/sdk';

const BASE = 'https://api.github.com';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function headers() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'AI-BOS',
  };
}

async function ghFetch(path, method = 'GET', body = null) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${json.message}`);
  return json;
}

// ── Get authenticated user ─────────────────────────────────────────
async function getUser() {
  return ghFetch('/user');
}

// ── Create a repo ──────────────────────────────────────────────────
async function createRepo(name, description, isPrivate = true) {
  return ghFetch('/user/repos', 'POST', {
    name,
    description,
    private: isPrivate,
    auto_init: true, // creates main branch with initial commit
  });
}

// ── Push a single file ─────────────────────────────────────────────
async function pushFile(owner, repo, filePath, content, message) {
  const encoded = Buffer.from(content).toString('base64');
  return ghFetch(`/repos/${owner}/${repo}/contents/${filePath}`, 'PUT', {
    message,
    content: encoded,
  });
}

// ── Generate scaffold files from architect output ──────────────────
async function generateScaffold(command, architectOutput) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    system: `You generate minimal project scaffold files based on an architect's plan.
Return a JSON array only — no markdown, no explanation.
Each item: { "path": "relative/file/path", "content": "file content here" }
Generate 5-8 files max: README.md, package.json or requirements.txt, main entry file, folder structure files (.gitkeep), and a basic config.
Keep file contents short and practical.`,
    messages: [{
      role: 'user',
      content: `CEO Command: "${command}"\n\nArchitect plan:\n${architectOutput}\n\nGenerate the scaffold files.`,
    }],
  });

  const raw = response.content[0]?.text?.trim() || '[]';
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(clean);
}

// ── Slugify a command into a repo name ─────────────────────────────
function toRepoName(command) {
  return command
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-')
    .substring(0, 40)
    .replace(/-+$/, '');
}

// ── Main: scaffold a full repo from a pipeline run ─────────────────
export async function scaffoldRepo(command, architectOutput) {
  if (!process.env.GITHUB_TOKEN) {
    return { ok: false, reason: 'No GITHUB_TOKEN set' };
  }

  try {
    const user = await getUser();
    const owner = user.login;
    const repoName = toRepoName(command);
    const description = `AI-BOS scaffold: ${command.substring(0, 100)}`;

    // Create the repo
    const repo = await createRepo(repoName, description, true);
    const repoUrl = repo.html_url;

    // Generate scaffold files using Claude
    const files = await generateScaffold(command, architectOutput);

    // Push each file (skip README.md — GitHub auto_init already created it)
    for (const file of files) {
      if (!file.path || !file.content) continue;
      try {
        await pushFile(owner, repoName, file.path, file.content, `scaffold: add ${file.path}`);
      } catch (e) {
        // If README already exists, overwrite it by getting its SHA first
        if (file.path === 'README.md') {
          try {
            const existing = await ghFetch(`/repos/${owner}/${repoName}/contents/README.md`);
            const encoded = Buffer.from(file.content).toString('base64');
            await ghFetch(`/repos/${owner}/${repoName}/contents/README.md`, 'PUT', {
              message: 'scaffold: update README',
              content: encoded,
              sha: existing.sha,
            });
          } catch {}
        }
      }
    }

    return { ok: true, repoUrl, repoName, owner, filesCreated: files.length };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

export default { scaffoldRepo };
