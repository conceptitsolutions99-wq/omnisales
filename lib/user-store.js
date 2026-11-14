// Accounts created by the admin live in a tiny key-value store so they survive
// restarts and are shared by every instance. Upstash Redis over HTTPS (free plan,
// no card) keeps this dependency to two environment variables.
//
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//
// Without them the store falls back to memory, which is enough for local work but
// is not shared between serverless instances.
const crypto = require('crypto');

const KEY = 'omnisales:users';

const baseUrl = () => (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || '';
const configured = () => Boolean(baseUrl() && token());

let memory = [];

const redis = async (path, options = {}) => {
  const response = await fetch(`${baseUrl()}/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token()}`, ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`Account store error (${response.status}).`);
  return response.json();
};

const readAll = async () => {
  if (!configured()) return memory;

  try {
    const data = await redis(`get/${encodeURIComponent(KEY)}`);
    if (!data.result) return [];
    const parsed = JSON.parse(data.result);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Could not read accounts:', err.message);
    return [];
  }
};

const writeAll = async (users) => {
  if (!configured()) {
    memory = users;
    return;
  }
  await redis(`set/${encodeURIComponent(KEY)}`, { method: 'POST', body: JSON.stringify(users) });
};

/* ─────────────────────────────  passwords  ───────────────────────────── */

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  `scrypt:${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;

const verifyPassword = (password, stored) => {
  const [scheme, salt, hash] = String(stored || '').split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password || ''), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
};

// Readable temporary passwords: no look-alike characters, so they survive being read aloud
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const tempPassword = () => {
  const bytes = crypto.randomBytes(12);
  const body = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');
  return `${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
};

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status || 'Active',
  mustChangePassword: Boolean(user.mustChangePassword),
  permissions: user.permissions || { leads: true, dialler: true, analytics: false, followups: true, admin: false }
});

/* ─────────────────────────────  accounts  ───────────────────────────── */

const findUser = async (email) => {
  const target = String(email || '').trim().toLowerCase();
  const users = await readAll();
  return users.find((user) => String(user.email).toLowerCase() === target) || null;
};

const listUsers = async () => (await readAll()).map(publicUser);

const createUser = async ({ name, email, role, permissions }) => {
  const users = await readAll();
  const address = String(email || '').trim().toLowerCase();

  if (!name || !address) throw new Error('Name and email are required.');
  if (users.some((user) => String(user.email).toLowerCase() === address)) {
    throw new Error('An account with that email already exists.');
  }

  const password = tempPassword();
  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: address,
    role: role || 'Sales Agent',
    status: 'Active',
    mustChangePassword: true,
    permissions: permissions || { leads: true, dialler: true, analytics: false, followups: true, admin: false },
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };

  await writeAll([...users, user]);
  return { user: publicUser(user), tempPassword: password };
};

// Admin-issued reset: hand over a fresh temporary password, force a change on next sign-in
const resetPassword = async (email) => {
  const users = await readAll();
  const address = String(email || '').trim().toLowerCase();
  const password = tempPassword();
  let found = false;

  const updated = users.map((user) => {
    if (String(user.email).toLowerCase() !== address) return user;
    found = true;
    return { ...user, passwordHash: hashPassword(password), mustChangePassword: true };
  });

  if (!found) throw new Error('No account with that email.');
  await writeAll(updated);
  return { tempPassword: password };
};

const updateUser = async (email, patch) => {
  const users = await readAll();
  const address = String(email || '').trim().toLowerCase();
  const updated = users.map((user) => {
    if (String(user.email).toLowerCase() !== address) return user;
    const next = { ...user };
    if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim();
    if (typeof patch.role === 'string' && patch.role.trim()) next.role = patch.role.trim();
    if (patch.permissions && typeof patch.permissions === 'object') {
      next.permissions = { ...next.permissions, ...patch.permissions };
    }
    return next;
  });
  await writeAll(updated);
};

const setPassword = async (email, newPassword) => {
  const users = await readAll();
  const address = String(email || '').trim().toLowerCase();
  let found = false;

  const updated = users.map((user) => {
    if (String(user.email).toLowerCase() !== address) return user;
    found = true;
    return { ...user, passwordHash: hashPassword(newPassword), mustChangePassword: false };
  });

  if (!found) throw new Error('No account with that email.');
  await writeAll(updated);
};

const setStatus = async (email, status) => {
  const users = await readAll();
  const address = String(email || '').trim().toLowerCase();
  const updated = users.map((user) =>
    String(user.email).toLowerCase() === address ? { ...user, status } : user
  );
  await writeAll(updated);
};

module.exports = {
  configured,
  hashPassword,
  verifyPassword,
  findUser,
  listUsers,
  createUser,
  resetPassword,
  updateUser,
  setPassword,
  setStatus,
  publicUser
};
