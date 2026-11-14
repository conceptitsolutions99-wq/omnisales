// POST /api/auth/login — verifies credentials on the server and starts a signed session.
const auth = require('../../lib/auth-core');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  if (!process.env.AUTH_SECRET) {
    return res.status(503).json({
      error: 'Sign-in is not configured. Add AUTH_SECRET and ADMIN_EMAIL/ADMIN_PASSWORD (or APP_USERS) to the environment, then redeploy.'
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

  const user = auth.findUser(email);

  // Same answer for an unknown account and a wrong password
  if (!user || user.status === 'Suspended' || !auth.verifyPassword(password, user.passwordHash)) {
    auth.recordFailure(ip);
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  auth.clearFailures(ip);
  res.setHeader('Set-Cookie', auth.cookieFor(req, auth.createSession(user)));
  return res.status(200).json({ ok: true, user: auth.publicUser(user) });
};
