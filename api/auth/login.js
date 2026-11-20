// POST /api/auth/login — verifies credentials on the server and starts a signed session.
const auth = require('../../lib/auth-core');
const store = require('../../lib/user-store');
const signinNotify = require('../../lib/signin-notify');
const signinFailures = require('../../lib/signin-failures');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  if (!process.env.AUTH_SECRET) {
    return res.status(503).json({
      error: 'Sign-in is not configured. Add AUTH_SECRET to the environment, then redeploy.'
    });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (auth.throttled(ip)) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Wait a few minutes and try again.' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const account = await auth.resolveAccount(email);
  const suspended = Boolean(account) && account.status === 'Suspended';
  const passwordOk = Boolean(account) && !suspended && store.verifyPassword(password, account.passwordHash);

  // Same answer for an unknown account and a wrong password
  if (!account || suspended || !passwordOk) {
    auth.recordFailure(ip);

    // A run of wrong passwords for a real account is what the admin hears about. Unknown
    // addresses, suspended accounts and correct passwords are not counted, and the alert
    // carries no password material in either direction.
    if (account && !suspended && !passwordOk) {
      const failure = await signinFailures.recordFailure(account.email, { ip });
      if (failure.shouldAlert) {
        await signinNotify.notifyFailedSignIns({
          account,
          req,
          ip,
          attempts: failure.count,
          at: failure.lastAt
        });
      }
    }

    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  auth.clearFailures(ip);
  await signinFailures.clearFailures(account.email);
  // The admin is told when a staff account signs in. The note is best effort: its own failures
  // are swallowed so a mail problem can never keep someone out of the workspace.
  await signinNotify.notifySignIn({ account, req });
  res.setHeader('Set-Cookie', auth.cookieFor(req, auth.createSession(account)));
  return res.status(200).json({
    ok: true,
    user: { ...store.publicUser(account), mustChangePassword: Boolean(account.mustChangePassword) }
  });
};
