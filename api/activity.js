// Vercel serverless function: the team's call and email history, plus the screenshot proof trail
// for WhatsApp outreach. An admin reads every employee's activity; an employee reads only their
// own. The list of leads is shared with everyone either way.
//
// The proof endpoints live here, on ?whatsapp=1, because a deployment on the Hobby plan may only
// contain twelve serverless functions and both resources are the same outreach record.
const auth = require('../lib/auth-core');
const store = require('../lib/activity-store');
const proofs = require('../lib/whatsapp-proof-store');

const isReviewer = (session) =>
  auth.isAdmin(session) || session.role === 'Analyst' || Boolean(session.permissions?.analytics);

const ownedBy = (proof, session) =>
  String(proof?.agentEmail || '').toLowerCase() === String(session?.email || '').toLowerCase();

const handleWhatsApp = async (req, res, session) => {
  const reviewer = isReviewer(session);

  if (req.method === 'GET') {
    const id = String(req.query?.id || '').trim();

    // One proof, with its images, is loaded only when a reviewer opens it
    if (id) {
      const proof = await proofs.getProof(id);
      if (!proof) return res.status(404).json({ error: 'That WhatsApp proof was not found.' });
      if (!reviewer && !ownedBy(proof, session)) {
        return res.status(403).json({ error: 'Only an admin or analyst can open a colleague’s WhatsApp proof.' });
      }
      return res.status(200).json({ ok: true, proof });
    }

    const all = await proofs.listProofs();
    const visible = reviewer ? all : all.filter((proof) => ownedBy(proof, session));
    return res.status(200).json({
      ok: true,
      count: visible.length,
      proofs: visible,
      scope: reviewer ? 'team' : 'own',
      maxImages: proofs.MAX_IMAGES
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }

  const { leadId, leadName, company, phone, note, images } = req.body || {};

  try {
    const proof = await proofs.addProof(
      { leadId, leadName, company, phone, note, images },
      { name: session.name, email: session.email }
    );
    return res.status(201).json({ ok: true, proof });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('Could not save a WhatsApp proof:', err.message);
    return res.status(status).json({ error: err.message || 'The screenshots could not be saved.' });
  }
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  if (String(req.query?.whatsapp || '') === '1') {
    return handleWhatsApp(req, res, session);
  }

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
