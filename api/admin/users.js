// /api/admin/users — staff accounts. Admin only.
//   GET   list accounts
//   POST  create one and return its temporary password (shown once)
//   PATCH reset the password or change the account status
const auth = require('../../lib/auth-core');
const store = require('../../lib/user-store');

const PERMISSION_PRESETS = {
  Admin: { leads: true, dialler: true, analytics: true, followups: true, admin: true },
  'Sales Agent': { leads: true, dialler: true, analytics: false, followups: true, admin: false },
  'Follow-up Agent': { leads: true, dialler: true, analytics: false, followups: true, admin: false },
  Analyst: { leads: true, dialler: false, analytics: true, followups: true, admin: false }
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const session = auth.requireActiveSession(req, res);
  if (!session) return undefined;

  if (!auth.isAdmin(session)) {
    return res.status(403).json({ error: 'Only an admin can manage staff accounts.' });
  }

  if (!store.configured()) {
    console.warn('Account store is not configured; accounts will not persist.');
  }

  try {
    if (req.method === 'GET') {
      const users = await store.listUsers();
      return res.status(200).json({ ok: true, users, storage: store.configured() ? 'persistent' : 'memory' });
    }

    if (req.method === 'POST') {
      const { name, email, role } = req.body || {};
      const account = await store.createUser({
        name,
        email,
        role,
        permissions: PERMISSION_PRESETS[role] || PERMISSION_PRESETS['Sales Agent']
      });
      return res.status(201).json({ ok: true, user: account.user, tempPassword: account.tempPassword });
    }

    if (req.method === 'PATCH') {
      const { email, action, status } = req.body || {};

      if (action === 'reset-password') {
        const result = await store.resetPassword(email);
        return res.status(200).json({ ok: true, tempPassword: result.tempPassword });
      }

      if (action === 'update') {
        const { name, role, permissions } = req.body || {};
        await store.updateUser(email, { name, role, permissions });
        return res.status(200).json({ ok: true });
      }

      if (action === 'set-status') {
        if (!['Active', 'Suspended'].includes(status)) {
          return res.status(400).json({ error: 'Status must be Active or Suspended.' });
        }
        if (String(email).toLowerCase() === String(session.email).toLowerCase() && status === 'Suspended') {
          return res.status(400).json({ error: 'You cannot suspend your own account.' });
        }
        await store.setStatus(email, status);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'Unsupported method.' });
  } catch (err) {
    const message = err.message || 'Could not update staff accounts.';
    const conflict = /already exists|No account|required/i.test(message);
    return res.status(conflict ? 400 : 502).json({ error: message });
  }
};
