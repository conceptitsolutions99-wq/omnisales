// Accounts created by the admin live in Postgres so they survive restarts and are shared
// by every instance. lib/kv-store.js owns the connection (DATABASE_URL); without it the
// store falls back to memory, which is enough for local work but not for a deployment.
const crypto = require('crypto');
const kv = require('./kv-store');

const KEY = 'omnisales:users';
// Display name and outreach title chosen by the person themselves. They live apart from the
// account so the bootstrap admin, which is built from the environment on every request, can
// carry a chosen name too.
const PROFILE_KEY = 'omnisales:profiles';

const configured = () => kv.configured();

const readAll = async () => {
  try {
    const parsed = await kv.read(KEY, []);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Could not read accounts:', err.message);
    return [];
  }
};

const writeAll = async (users) => {
  await kv.write(KEY, users);
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
  title: user.title || user.role || '',
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
    if (typeof patch.title === 'string' && patch.title.trim()) next.title = patch.title.trim();
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

/* ─────────────────────────────  own profile  ───────────────────────────── */

const readProfiles = async () => {
  try {
    const parsed = await kv.read(PROFILE_KEY, {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.error('Could not read profiles:', err.message);
    return {};
  }
};

const findProfile = async (email) => {
  const profiles = await readProfiles();
  return profiles[String(email || '').trim().toLowerCase()] || null;
};

// A person may rename themselves and describe their own outreach title, never their role or
// permissions — those stay with the admin.
const saveProfile = async (email, { name, title }) => {
  const address = String(email || '').trim().toLowerCase();
  if (!address) throw new Error('A signed-in account is required.');

  const cleanName = String(name || '').trim().slice(0, 60);
  if (!cleanName) throw new Error('Your name cannot be empty.');

  const cleanTitle = String(title || '').trim().slice(0, 40);
  const profiles = await readProfiles();
  profiles[address] = { name: cleanName, title: cleanTitle, updatedAt: new Date().toISOString() };
  await kv.write(PROFILE_KEY, profiles);
  return profiles[address];
};

// An admin rename is authoritative, so it drops any name the person saved for themselves
const clearProfile = async (email) => {
  const address = String(email || '').trim().toLowerCase();
  const profiles = await readProfiles();
  if (!profiles[address]) return;
  delete profiles[address];
  await kv.write(PROFILE_KEY, profiles);
};

// Deleting removes the account and any profile it saved. There is no tombstone: a re-created
// account starts empty and gets a fresh temporary password.
const deleteUser = async (email) => {
  const address = String(email || '').trim().toLowerCase();
  const users = await readAll();
  const remaining = users.filter((user) => String(user.email).toLowerCase() !== address);
  if (remaining.length === users.length) throw new Error('No account with that email.');

  await writeAll(remaining);
  await clearProfile(address);
};

module.exports = {
  configured,
  findProfile,
  saveProfile,
  clearProfile,
  hashPassword,
  verifyPassword,
  findUser,
  listUsers,
  createUser,
  resetPassword,
  updateUser,
  setPassword,
  setStatus,
  deleteUser,
  publicUser
};
