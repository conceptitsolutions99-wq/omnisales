// Server-side authentication. Accounts come from the admin-managed store; a single
// bootstrap admin can also be supplied through ADMIN_EMAIL/ADMIN_PASSWORD so a fresh
// deployment is never locked out.
const crypto = require('crypto');
const store = require('./user-store');

const COOKIE_NAME = 'cit_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;

const secret = () => process.env.AUTH_SECRET || '';

/* ─────────────────────────────  accounts  ───────────────────────────── */

// The bootstrap admin's salt is derived from the email so the hash is stable across instances
const bootstrapSalt = (email) =>
  crypto.createHash('sha256').update(`bootstrap:${String(email).toLowerCase()}`).digest('hex').slice(0, 32);

const bootstrapAccount = (email) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return null;
  if (String(email || '').trim().toLowerCase() !== adminEmail.toLowerCase()) return null;

  return {
    id: 'bootstrap-admin',
    name: process.env.ADMIN_NAME || 'Administrator',
    email: adminEmail,
    role: 'Admin',
    status: 'Active',
    mustChangePassword: false,
    permissions: { leads: true, dialler: true, analytics: true, followups: true, admin: true },
    passwordHash: store.hashPassword(adminPassword, bootstrapSalt(adminEmail))
  };
};

const resolveAccount = async (email) => (await store.findUser(email)) || bootstrapAccount(email);

const findAccount = async (email) => {
  const account = await resolveAccount(email);
  return account ? store.publicUser(account) : null;
};

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

const createSession = (account) =>
  sign({
    sub: account.email,
    name: account.name,
    role: account.role,
    mustChange: Boolean(account.mustChangePassword),
    permissions: store.publicUser(account).permissions,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  });

const getSession = (req) => {
  const payload = readToken(parseCookies(req)[COOKIE_NAME]);
  if (!payload) return null;
  return {
    email: payload.sub,
    name: payload.name,
    role: payload.role,
    mustChange: Boolean(payload.mustChange),
    permissions: payload.permissions || {}
  };
};

const isAdmin = (session) => Boolean(session) && (session.role === 'Admin' || Boolean(session.permissions?.admin));

const requireSession = (req, res) => {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return null;
  }
  return session;
};

// Everything except the password change (and sign-out) waits until the temp password is replaced
const requireActiveSession = (req, res) => {
  const session = requireSession(req, res);
  if (!session) return null;
  if (session.mustChange) {
    res.status(403).json({ error: 'Set a new password to continue.', code: 'PASSWORD_CHANGE_REQUIRED' });
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
  resolveAccount,
  findAccount,
  createSession,
  getSession,
  requireSession,
  requireActiveSession,
  isAdmin,
  cookieFor,
  throttled,
  recordFailure,
  clearFailures
};
