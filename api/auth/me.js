// GET /api/auth/me — who is signed in, according to the session cookie.
const auth = require('../../lib/auth-core');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const session = auth.getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in.' });

  const user = auth.loadUsers().find((candidate) => String(candidate.email).toLowerCase() === session.email.toLowerCase());
  if (!user || user.status === 'Suspended') {
    res.setHeader('Set-Cookie', auth.cookieFor(req, '', 0));
    return res.status(401).json({ error: 'This account is no longer active.' });
  }

  return res.status(200).json({ ok: true, user: auth.publicUser(user) });
};
