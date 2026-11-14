// POST /api/auth/logout — clears the session cookie.
const auth = require('../../lib/auth-core');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  res.setHeader('Set-Cookie', auth.cookieFor(req, '', 0));
  return res.status(200).json({ ok: true });
};
