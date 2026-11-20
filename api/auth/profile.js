// POST /api/auth/profile — the signed-in person changes their own display name and
// outreach title. Role and permissions stay with the admin, so they are not accepted here.
const auth = require('../../lib/auth-core');
const store = require('../../lib/user-store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  const session = await auth.requireSession(req, res);
  if (!session) return undefined;

  const { name, title } = req.body || {};

  try {
    await store.saveProfile(session.email, { name, title });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not save your profile.' });
  }

  const user = await auth.findAccount(session.email);
  if (!user) return res.status(401).json({ error: 'This account is no longer active.' });

  return res.status(200).json({ ok: true, user });
};
