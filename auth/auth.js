// auth/auth.js
// JWT + bcrypt authentication — users stored in knowledge/users.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.resolve(__dirname, '../knowledge/users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'aibos-dev-secret-change-in-production';
const TOKEN_TTL  = '7d';

function readUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch { return []; }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export const AuthStore = {
  hasUsers() { return readUsers().length > 0; },

  async register({ email, password, name }) {
    const users = readUsers();
    if (users.find(u => u.email === email))
      throw new Error('Email already registered');
    const hash = await bcrypt.hash(password, 12);
    const user = {
      id: crypto.randomUUID(),
      email: email.toLowerCase().trim(),
      name: name?.trim() || email.split('@')[0],
      passwordHash: hash,
      role: users.length === 0 ? 'admin' : 'member',
      workspaceId: 'default',
      created: new Date().toISOString(),
    };
    users.push(user);
    writeUsers(users);
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  },

  async login({ email, password }) {
    const users = readUsers();
    const user = users.find(u => u.email === email.toLowerCase().trim());
    if (!user) throw new Error('Invalid email or password');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new Error('Invalid email or password');
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, workspaceId: user.workspaceId },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  },

  verify(token) {
    return jwt.verify(token, JWT_SECRET);
  },

  getUsers() {
    return readUsers().map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, created: u.created }));
  },

  deleteUser(id) {
    const users = readUsers().filter(u => u.id !== id);
    writeUsers(users);
  },
};

// ── Department role assignments ────────────────────────────────────
const DEPT_ROLES_FILE = path.resolve(__dirname, '../knowledge/dept_roles.json');

function readDeptRoles() {
  try { return JSON.parse(fs.readFileSync(DEPT_ROLES_FILE, 'utf-8')); }
  catch { return {}; }
}
function writeDeptRoles(data) {
  fs.mkdirSync(path.dirname(DEPT_ROLES_FILE), { recursive: true });
  fs.writeFileSync(DEPT_ROLES_FILE, JSON.stringify(data, null, 2));
}

// dept_roles.json shape: { "userId": { "it": "editor", "finance": "viewer" }, ... }
// Roles: "admin" > "editor" > "viewer" > (absent = no access, unless global admin)
export const DeptRoleStore = {
  getAll() { return readDeptRoles(); },
  getUserRoles(userId) { return readDeptRoles()[userId] || {}; },
  setRole(userId, dept, role) {
    const data = readDeptRoles();
    if (!data[userId]) data[userId] = {};
    if (role === null) delete data[userId][dept];
    else data[userId][dept] = role;
    writeDeptRoles(data);
  },
  canAccess(user, dept, minRole = 'viewer') {
    if (!user) return false;
    if (user.role === 'admin') return true; // global admins see everything
    const LEVELS = { viewer: 1, editor: 2, admin: 3 };
    const roles = readDeptRoles();
    const userDeptRole = roles[user.id]?.[dept] || null;
    if (!userDeptRole) return false;
    return (LEVELS[userDeptRole] || 0) >= (LEVELS[minRole] || 1);
  },
};

// ── Express middleware ─────────────────────────────────────────────
export function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  const token  = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorised' });
  try {
    req.user = AuthStore.verify(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Middleware factory: requireRole('it', 'editor') — global admin always passes
export function requireDeptRole(dept, minRole = 'viewer') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorised' });
    if (DeptRoleStore.canAccess(req.user, dept, minRole)) return next();
    res.status(403).json({ error: `Requires ${minRole} access to ${dept}` });
  };
}

// ── Invite system ─────────────────────────────────────────────────
import { createHash } from 'crypto';

const INVITES_FILE = path.resolve(__dirname, '../knowledge/invites.json');

function readInvites() {
  try { return JSON.parse(fs.readFileSync(INVITES_FILE, 'utf-8')); }
  catch { return []; }
}
function writeInvites(data) { fs.writeFileSync(INVITES_FILE, JSON.stringify(data, null, 2)); }

export const InviteStore = {
  create({ email, workspaceId = 'default', createdBy, expiresInHours = 72 }) {
    const token = createHash('sha256')
      .update(`${email}-${Date.now()}-${Math.random()}`)
      .digest('hex').slice(0, 32);
    const invite = {
      token, email: email?.toLowerCase().trim() || null,
      workspaceId, createdBy,
      expiresAt: new Date(Date.now() + expiresInHours * 3600000).toISOString(),
      used: false, created: new Date().toISOString(),
    };
    const invites = readInvites();
    invites.push(invite);
    writeInvites(invites);
    return invite;
  },

  validate(token) {
    const invites = readInvites();
    const invite  = invites.find(i => i.token === token);
    if (!invite)               throw new Error('Invalid invite link');
    if (invite.used)           throw new Error('This invite has already been used');
    if (new Date(invite.expiresAt) < new Date()) throw new Error('Invite link has expired');
    return invite;
  },

  consume(token) {
    const invites = readInvites();
    const invite  = invites.find(i => i.token === token);
    if (invite) { invite.used = true; invite.usedAt = new Date().toISOString(); }
    writeInvites(invites);
    return invite;
  },

  getAll() { return readInvites(); },

  revoke(token) {
    writeInvites(readInvites().filter(i => i.token !== token));
  },
};

export default AuthStore;
