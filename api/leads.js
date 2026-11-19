// Vercel serverless function: the team's shared lead list.
// Every signed-in employee reads the same list, so a contact one makes is visible to all.
// Deleting is the one write only an admin can make, because it removes the lead for everyone.
const auth = require('../lib/auth-core');
const store = require('../lib/leads-store');

const payload = async (leads) => ({
  ok: true,
  count: leads.length,
  leads,
  deleted: await store.listDeleted()
});

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const leads = await store.listLeads();
    return res.status(200).json({ ...(await payload(leads)), storage: store.configured() ? 'persistent' : 'memory' });
  }

  if (req.method === 'DELETE') {
    if (!auth.isAdmin(session)) {
      return res.status(403).json({ error: 'Only an admin can delete leads.' });
    }

    const { leads } = req.body || {};
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'Send the leads to delete as an array.' });
    }

    const remaining = await store.deleteLeads(leads);
    return res.status(200).json(await payload(remaining));
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Use GET, POST or DELETE.' });
  }

  const { leads } = req.body || {};
  if (!Array.isArray(leads)) {
    return res.status(400).json({ error: 'Send the leads as an array.' });
  }

  const actor = { name: session.name || session.email || '', email: session.email || '' };
  const merged = await store.upsertLeads(leads, actor);
  return res.status(200).json(await payload(merged));
};
