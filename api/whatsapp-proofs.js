// Vercel serverless function: the screenshot proof trail for WhatsApp outreach.
// An admin or analyst reviews the whole team's proofs; an agent sees and adds only their own.
const auth = require('../lib/auth-core');
const store = require('../lib/whatsapp-proof-store');

const isReviewer = (session) =>
  auth.isAdmin(session) || session.role === 'Analyst' || Boolean(session.permissions?.analytics);

const ownedBy = (proof, session) =>
  String(proof?.agentEmail || '').toLowerCase() === String(session?.email || '').toLowerCase();

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  const reviewer = isReviewer(session);

  if (req.method === 'GET') {
    const id = String(req.query?.id || '').trim();

    // One proof, with its images, is loaded only when a reviewer opens it
    if (id) {
      const proof = await store.getProof(id);
      if (!proof) return res.status(404).json({ error: 'That WhatsApp proof was not found.' });
      if (!reviewer && !ownedBy(proof, session)) {
        return res.status(403).json({ error: 'Only an admin or analyst can open a colleague’s WhatsApp proof.' });
      }
      return res.status(200).json({ ok: true, proof });
    }

    const all = await store.listProofs();
    const visible = reviewer ? all : all.filter((proof) => ownedBy(proof, session));
    return res.status(200).json({
      ok: true,
      count: visible.length,
      proofs: visible,
      scope: reviewer ? 'team' : 'own',
      maxImages: store.MAX_IMAGES
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }

  const { leadId, leadName, company, phone, note, images } = req.body || {};

  try {
    const proof = await store.addProof(
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
