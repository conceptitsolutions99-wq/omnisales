// POST /api/auth/change-password — replaces a temporary password with one the user chooses.
const auth = require('../../lib/auth-core');
const store = require('../../lib/user-store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  const session = auth.requireSession(req, res);
  if (!session) return undefined;

  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Choose a password of at least 8 characters.' });
  }
  if (String(newPassword) === String(currentPassword)) {
    return res.status(400).json({ error: 'The new password must be different from the temporary one.' });
  }

  const account = await auth.resolveAccount(session.email);
  if (!account || !store.verifyPassword(currentPassword, account.passwordHash)) {
    return res.status(401).json({ error: 'That temporary password is not correct.' });
  }
  if (account.id === 'bootstrap-admin') {
    return res.status(400).json({ error: 'This account signs in with the password set in the server environment.' });
  }

  await store.setPassword(session.email, newPassword);

  // Re-issue the session so the password-change gate lifts immediately
  const updated = { ...account, mustChangePassword: false };
  res.setHeader('Set-Cookie', auth.cookieFor(req, auth.createSession(updated)));

  return res.status(200).json({ ok: true, user: store.publicUser(updated) });
};
