// GET /api/auth/me — who is signed in, according to the session cookie.
const auth = require('../../lib/auth-core');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const session = await auth.getSession(req);
  if (!session) {
    // The cookie may belong to a deleted or suspended account, so it is cleared here too
    res.setHeader('Set-Cookie', auth.cookieFor(req, '', 0));
    return res.status(401).json({ error: 'Not signed in.' });
  }

  const user = await auth.findAccount(session.email);
  if (!user || user.status === 'Suspended') {
    res.setHeader('Set-Cookie', auth.cookieFor(req, '', 0));
    return res.status(401).json({ error: 'This account is no longer active.' });
  }

  return res.status(200).json({
    ok: true,
    user: { ...user, mustChangePassword: user.mustChangePassword || session.mustChange }
  });
};
