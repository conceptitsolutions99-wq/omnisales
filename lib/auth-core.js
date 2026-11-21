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

// A profile saved by the person themselves overrides the name and outreach title on the account,
// for the bootstrap admin as well as for admin-created staff
const resolveAccount = async (email) => {
  const account = (await store.findUser(email)) || bootstrapAccount(email);
  if (!account) return null;

  const profile = await store.findProfile(account.email);
  if (!profile) return account;

  return {
    ...account,
    name: profile.name || account.name,
    title: profile.title || account.title || account.role
  };
};

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

// The version lets an admin kill sessions that are already in a browser: suspending an account
// bumps it, and a re-created account starts on a random one, so a cookie from the deleted
// account can never open its replacement. Accounts that predate the field count as zero.
const versionOf = (account) => account?.sessionVersion ?? 0;

const createSession = (account) =>
  sign({
    sub: account.email,
    ver: versionOf(account),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  });

// A cookie is only a claim: every request re-reads the account, so a deleted or suspended
// employee loses access immediately instead of when the twelve hours run out. The current
// account also supplies the role and permissions, so an admin change applies on the next call.
const getSession = async (req) => {
  const payload = readToken(parseCookies(req)[COOKIE_NAME]);
  if (!payload || !payload.sub) return null;

  const account = await resolveAccount(payload.sub);
  if (!account) return null;
  if (String(account.status || 'Active') !== 'Active') return null;
  if (versionOf(account) !== (payload.ver ?? 0)) return null;

  const publicAccount = store.publicUser(account);
  return {
    email: account.email,
    name: account.name,
    title: account.title || publicAccount.title,
    role: account.role,
    mustChange: Boolean(account.mustChangePassword),
    permissions: publicAccount.permissions
  };
};

const isAdmin = (session) => Boolean(session) && (session.role === 'Admin' || Boolean(session.permissions?.admin));

// Admin and analyst review every employee's customer replies and forms; an agent sees only
// the responses to their own outreach.
const isReviewer = (session) =>
  isAdmin(session) || session?.role === 'Analyst' || Boolean(session?.permissions?.analytics);

const requireSession = async (req, res) => {
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return null;
  }
  return session;
};

// Everything except the password change (and sign-out) waits until the temp password is replaced
const requireActiveSession = async (req, res) => {
  const session = await requireSession(req, res);
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
// The addresses are kept, never the password: the pattern worth reporting is one source trying
// many accounts, which a per-account alert never sees. The list is capped so a spray cannot grow
// without bound; duplicates collapse so the message stays readable.
const MAX_TRACKED_ADDRESSES = 25;

const entryFor = (key, now) => {
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    const fresh = { first: now, count: 0, emails: [] };
    attempts.set(key, fresh);
    return fresh;
  }
  return entry;
};

const throttled = (key) => entryFor(key, Date.now()).count >= MAX_ATTEMPTS;

// One failure is counted against the address it came from. The result says whether this attempt
// is the one that reached the limit, so a single alert per window is sent instead of one per
// later attempt, and it carries the addresses tried so far.
const recordFailure = (key, email = '') => {
  const now = Date.now();
  const entry = entryFor(key, now);
  entry.count += 1;

  const address = String(email || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  if (address && !entry.emails.includes(address) && entry.emails.length < MAX_TRACKED_ADDRESSES) {
    entry.emails.push(address);
  }

  return { count: entry.count, tripped: entry.count === MAX_ATTEMPTS, emails: [...entry.emails], first: entry.first };
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
  isReviewer,
  cookieFor,
  throttled,
  recordFailure,
  clearFailures
};
