// POST /api/auth/login — verifies credentials on the server and starts a signed session.
const auth = require('../../lib/auth-core');
const store = require('../../lib/user-store');

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

  // Same answer for an unknown account and a wrong password
  if (!account || account.status === 'Suspended' || !store.verifyPassword(password, account.passwordHash)) {
    auth.recordFailure(ip);
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  auth.clearFailures(ip);
  res.setHeader('Set-Cookie', auth.cookieFor(req, auth.createSession(account)));
  return res.status(200).json({
    ok: true,
    user: { ...store.publicUser(account), mustChangePassword: Boolean(account.mustChangePassword) }
  });
};
