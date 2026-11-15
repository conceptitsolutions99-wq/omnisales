// Vercel serverless function: the team's shared lead list.
// Every signed-in employee reads the same list, so a contact one makes is visible to all.
const auth = require('../lib/auth-core');
const store = require('../lib/leads-store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const leads = await store.listLeads();
    return res.status(200).json({ ok: true, count: leads.length, leads, storage: store.configured() ? 'persistent' : 'memory' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }

  const { leads } = req.body || {};
  if (!Array.isArray(leads)) {
    return res.status(400).json({ error: 'Send the leads as an array.' });
  }

  const actor = { name: session.name || session.email || '', email: session.email || '' };
  const merged = await store.upsertLeads(leads, actor);
  return res.status(200).json({ ok: true, count: merged.length, leads: merged });
};
