// Vercel serverless function: the team's call and email history, plus the screenshot proof trail
// for WhatsApp outreach. An admin reads every employee's activity; an employee reads only their
// own. The list of leads is shared with everyone either way.
//
// The proof endpoints live here, on ?whatsapp=1, because a deployment on the Hobby plan may only
// contain twelve serverless functions and both resources are the same outreach record.
const auth = require('../lib/auth-core');
const store = require('../lib/activity-store');
const proofs = require('../lib/whatsapp-proof-store');
const followupsStore = require('../lib/followups-store');

const isReviewer = (session) =>
  auth.isAdmin(session) || session.role === 'Analyst' || Boolean(session.permissions?.analytics);

const ownedBy = (proof, session) =>
  String(proof?.agentEmail || '').toLowerCase() === String(session?.email || '').toLowerCase();

// Ownership is the account address first, so a renamed employee keeps their history; rows
// recorded before the address was stored fall back to the display name they carry.
const ownsActivity = (entry, session) => {
  const owner = String(entry?.callerEmail || '').trim().toLowerCase();
  const viewer = String(session?.email || '').trim().toLowerCase();
  if (owner) return Boolean(viewer) && owner === viewer;
  return String(entry?.caller || '') === String(session?.name || '');
};

const ownsFollowup = (task, session) => {
  const ownerEmail = String(task?.assignedToEmail || '').toLowerCase();
  if (ownerEmail) return ownerEmail === String(session?.email || '').toLowerCase();
  return String(task?.assignedTo || '') === String(session?.name || '');
};

// Follow-ups ride on this function for the same reason the proof trail does: the plan allows
// twelve serverless functions. An admin sees every task; an agent sees the ones assigned to them.
const handleFollowups = async (req, res, session) => {
  const visible = (tasks) => (auth.isAdmin(session) ? tasks : tasks.filter((task) => ownsFollowup(task, session)));

  if (req.method === 'GET') {
    const tasks = visible(await followupsStore.listFollowups());
    return res.status(200).json({
      ok: true,
      count: tasks.length,
      followups: tasks,
      scope: auth.isAdmin(session) ? 'team' : 'own'
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }

  const { followups } = req.body || {};
  if (!Array.isArray(followups)) {
    return res.status(400).json({ error: 'Send the follow-ups as an array.' });
  }

  try {
    await followupsStore.upsertFollowups(followups, { name: session.name, email: session.email });
  } catch (err) {
    console.error('Could not save follow-ups:', err.message);
    return res.status(502).json({ error: 'The follow-up queue could not be saved.' });
  }

  const tasks = visible(await followupsStore.listFollowups());
  return res.status(200).json({
    ok: true,
    count: tasks.length,
    followups: tasks,
    scope: auth.isAdmin(session) ? 'team' : 'own'
  });
};

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

  const session = await auth.requireActiveSession(req, res);
  if (!session) return;

  if (String(req.query?.whatsapp || '') === '1') {
    return handleWhatsApp(req, res, session);
  }

  if (String(req.query?.followups || '') === '1') {
    return handleFollowups(req, res, session);
  }

  if (req.method === 'GET') {
    const all = await store.listActivity();
    const admin = auth.isAdmin(session);
    const visible = admin ? all : all.filter((entry) => ownsActivity(entry, session));
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
  const visible = admin ? merged : merged.filter((entry) => ownsActivity(entry, session));

  return res.status(200).json({ ok: true, count: visible.length, activity: visible, scope: admin ? 'team' : 'own' });
};
