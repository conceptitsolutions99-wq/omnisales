// Vercel serverless function: the team's call and email history.
// An admin reads every employee's activity; an employee reads only their own. The list of leads
// is shared with everyone either way.
const auth = require('../lib/auth-core');
const store = require('../lib/activity-store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const all = await store.listActivity();
    const admin = auth.isAdmin(session);
    const visible = admin
      ? all
      : all.filter((entry) => String(entry.callerEmail || '').toLowerCase() === String(session.email || '').toLowerCase());
    return res.status(200).json({ ok: true, count: visible.length, activity: visible, scope: admin ? 'team' : 'own' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }

  const { activity } = req.body || {};
  if (!Array.isArray(activity)) {
    return res.status(400).json({ error: 'Send the activity as an array.' });
  }

  const merged = await store.addActivity(activity, { name: session.name, email: session.email });
  const admin = auth.isAdmin(session);
  const visible = admin
    ? merged
    : merged.filter((entry) => String(entry.callerEmail || '').toLowerCase() === String(session.email || '').toLowerCase());

  return res.status(200).json({ ok: true, count: visible.length, activity: visible, scope: admin ? 'team' : 'own' });
};
