// Server-side authentication: users live in the environment, sessions are signed
// HttpOnly cookies, and nothing about a password ever reaches the browser.
const crypto = require('crypto');

const COOKIE_NAME = 'cit_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;

const secret = () => process.env.AUTH_SECRET || '';

/* ─────────────────────────────  passwords  ───────────────────────────── */

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  `scrypt:${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;

const verifyPassword = (password, stored) => {
  const [scheme, salt, hash] = String(stored || '').split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;

  const candidate = crypto.scryptSync(String(password || ''), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
};

/* ─────────────────────────────  accounts  ───────────────────────────── */

// APP_USERS wins; ADMIN_EMAIL/ADMIN_PASSWORD is the single-account bootstrap.
const loadUsers = () => {
  const raw = process.env.APP_USERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((user) => user && user.email);
    } catch (err) {
      console.error('APP_USERS is not valid JSON:', err.message);
    }
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    return [
      {
        id: 1,
        name: process.env.ADMIN_NAME || 'Administrator',
        email,
        role: 'Admin',
        status: 'Active',
        permissions: { leads: true, dialler: true, analytics: true, followups: true, admin: true },
        passwordHash: hashPassword(password, crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32))
      }
    ];
  }

  return [];
};

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status || 'Active',
  permissions: user.permissions || { leads: true, dialler: true, analytics: false, followups: true, admin: false }
});

const findUser = (email) =>
  loadUsers().find((user) => String(user.email).toLowerCase() === String(email || '').trim().toLowerCase());

/* ─────────────────────────────  sessions  ───────────────────────────── */

const sign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
};

const readToken = (token) => {
  if (!token || !secret()) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;

  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const given = Buffer.from(mac);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (err) {
    return null;
  }
};

const isHttps = (req) =>
  (req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' ||
  Boolean(req.socket?.encrypted);

const cookieFor = (req, token, maxAge = SESSION_TTL_SECONDS) =>
  `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;

const parseCookies = (req) => {
  const header = req.headers?.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 1) return;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return out;
};

const createSession = (user) =>
  sign({
    sub: user.email,
    name: user.name,
    role: user.role,
    permissions: publicUser(user).permissions,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  });

const getSession = (req) => {
  const token = parseCookies(req)[COOKIE_NAME];
  const payload = readToken(token);
  if (!payload) return null;
  return { email: payload.sub, name: payload.name, role: payload.role, permissions: payload.permissions || {} };
};

const isAdmin = (session) => Boolean(session) && (session.role === 'Admin' || Boolean(session.permissions?.admin));

// Returns the session, or answers 401 and returns null
const requireSession = (req, res) => {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return null;
  }
  return session;
};

/* ─────────────────────────  login throttling  ───────────────────────── */

const attempts = new Map();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const throttled = (key) => {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { first: now, count: 0 });
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
};

const recordFailure = (key) => {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) attempts.set(key, { first: now, count: 1 });
  else entry.count += 1;
};

const clearFailures = (key) => attempts.delete(key);

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  hashPassword,
  verifyPassword,
  loadUsers,
  publicUser,
  findUser,
  createSession,
  getSession,
  requireSession,
  isAdmin,
  cookieFor,
  throttled,
  recordFailure,
  clearFailures
};
