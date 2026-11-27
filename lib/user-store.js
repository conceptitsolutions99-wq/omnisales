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

// Accounts are edited by the admin a field or an account at a time. Reading the list, changing it
// and writing it back happens under the row lock, so two admin actions at once cannot each write
// a list built before the other (a re-created account lost that way is a lockout).
const mutateUsers = (mutator) =>
  kv.update(KEY, [], (current) => mutator(Array.isArray(current) ? current : []));

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
  const address = String(email || '').trim().toLowerCase();

  if (!name || !address) throw new Error('Name and email are required.');

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
    // Random, not zero: a cookie minted for an earlier account with this address must not
    // become valid again when the address is re-created
    sessionVersion: crypto.randomBytes(8).toString('hex'),
    createdAt: new Date().toISOString()
  };

  let duplicate = false;
  await mutateUsers((users) => {
    if (users.some((existing) => String(existing.email).toLowerCase() === address)) {
      duplicate = true;
      return null;
    }
    return [...users, user];
  });

  if (duplicate) throw new Error('An account with that email already exists.');
  return { user: publicUser(user), tempPassword: password };
};

// Sessions carry the version they were minted under (lib/auth-core.js). Moving it forward is what
// logs out a browser that is already open, so every path that takes the account away bumps it.
const nextSessionVersion = (user) =>
  typeof user.sessionVersion === 'number' ? user.sessionVersion + 1 : crypto.randomBytes(8).toString('hex');

// Admin-issued reset: hand over a fresh temporary password, force a change on next sign-in, and
// end the sessions the old password opened, so a device still holding one cannot keep using it.
const resetPassword = async (email) => {
  const address = String(email || '').trim().toLowerCase();
  const password = tempPassword();
  let found = false;

  await mutateUsers((users) =>
    users.map((user) => {
      if (String(user.email).toLowerCase() !== address) return user;
      found = true;
      return {
        ...user,
        passwordHash: hashPassword(password),
        mustChangePassword: true,
        sessionVersion: nextSessionVersion(user)
      };
    })
  );

  if (!found) throw new Error('No account with that email.');
  return { tempPassword: password };
};

const updateUser = async (email, patch) => {
  const address = String(email || '').trim().toLowerCase();
  await mutateUsers((users) =>
    users.map((user) => {
      if (String(user.email).toLowerCase() !== address) return user;
      const next = { ...user };
      if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim();
      if (typeof patch.title === 'string' && patch.title.trim()) next.title = patch.title.trim();
      if (typeof patch.role === 'string' && patch.role.trim()) next.role = patch.role.trim();
      if (patch.permissions && typeof patch.permissions === 'object') {
        next.permissions = { ...next.permissions, ...patch.permissions };
      }
      return next;
    })
  );
};

const setPassword = async (email, newPassword) => {
  const address = String(email || '').trim().toLowerCase();
  let found = false;

  await mutateUsers((users) =>
    users.map((user) => {
      if (String(user.email).toLowerCase() !== address) return user;
      found = true;
      return { ...user, passwordHash: hashPassword(newPassword), mustChangePassword: false };
    })
  );

  if (!found) throw new Error('No account with that email.');
};

// A status change bumps the session version, so an already-open browser loses the account
// immediately and does not regain it if the account is later re-activated.
const setStatus = async (email, status) => {
  const address = String(email || '').trim().toLowerCase();
  await mutateUsers((users) =>
    users.map((user) => {
      if (String(user.email).toLowerCase() !== address) return user;
      if (String(user.status || 'Active') === status) return user;
      return { ...user, status, sessionVersion: nextSessionVersion(user) };
    })
  );
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
  let saved = null;
  await kv.update(PROFILE_KEY, {}, (current) => {
    const profiles = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    profiles[address] = { name: cleanName, title: cleanTitle, updatedAt: new Date().toISOString() };
    saved = profiles[address];
    return profiles;
  });
  return saved;
};

// An admin rename is authoritative, so it drops any name the person saved for themselves
const clearProfile = async (email) => {
  const address = String(email || '').trim().toLowerCase();
  await kv.update(PROFILE_KEY, {}, (current) => {
    const profiles = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    if (!profiles[address]) return null;
    delete profiles[address];
    return profiles;
  });
};

// Deleting removes the account and any profile it saved. There is no tombstone: a re-created
// account starts empty and gets a fresh temporary password.
const deleteUser = async (email) => {
  const address = String(email || '').trim().toLowerCase();
  let found = false;

  await mutateUsers((users) => {
    const remaining = users.filter((user) => {
      if (String(user.email).toLowerCase() !== address) return true;
      found = true;
      return false;
    });
    return found ? remaining : null;
  });

  if (!found) throw new Error('No account with that email.');
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
