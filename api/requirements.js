// Requirements forms: the customer opens ?token=... on the public page and ticks what they
// want; staff read the answers in the app. The token is the only credential the customer
// needs, so those two paths stay open and everything else requires a session.
const auth = require('../lib/auth-core');
const store = require('../lib/requirements-store');
const notify = require('../lib/requirements-notify');

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

// Links the customer receives have to point at the app the team actually uses
const appOrigin = (req) =>
  (process.env.APP_ORIGIN || `https://${req.headers.host || 'omnisales-delta.vercel.app'}`).replace(/\/$/, '');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const token = clean(url.searchParams.get('token'), 64);

  // ── public: load the form the customer was linked to ──
  if (req.method === 'GET' && token) {
    const request = await store.getRequest(token);
    if (!request) return res.status(404).json({ error: 'This form link is not valid any more.' });
    return res.status(200).json({ ok: true, request: store.publicRequest(request) });
  }

  // ── public: submit the ticked options ──
  // The token is the credential, so this must not depend on the browser's cookie: a staff
  // member opening a customer's link is still the customer of that form.
  if (req.method === 'POST' && req.body?.token) {
    const body = req.body;
    const saved = await store.saveAnswers(clean(body.token, 64), {
      details: body.details,
      answers: body.answers,
      notes: body.notes
    });
    if (!saved) return res.status(404).json({ error: 'This form link is not valid any more.' });

    // The customer has already answered, so the note goes out now and a failure is only logged:
    // the answers are saved either way
    const notified = await notify
      .notifySubmission({ request: saved, origin: appOrigin(req) })
      .catch((err) => ({ sent: false, reason: err.message }));

    return res.status(200).json({ ok: true, submittedAt: saved.submittedAt, notified: notified.sent });
  }

  const session = await auth.requireActiveSession(req, res);
  if (!session) return;

  const origin = appOrigin(req);

  // ── staff: the forms this lead already has, so the dialler can show their links ──
  if (req.method === 'GET' && (url.searchParams.has('leadId') || url.searchParams.has('leadEmail'))) {
    const links = await store.linksForLead({
      leadId: clean(url.searchParams.get('leadId'), 64) || null,
      leadEmail: clean(url.searchParams.get('leadEmail'), 200),
      origin
    });
    return res.status(200).json({ ok: true, links });
  }

  // ── staff: mint a link the agent copies and pastes into WhatsApp or their own mail app ──
  // The link is a real record, so the answers come back to the Requirements panel exactly as
  // they do for a form attached to an email. A form already sent to this lead is reused rather
  // than duplicated, so the panel never lists the same project twice.
  if (req.method === 'POST' && req.body?.action === 'link') {
    const type = clean(req.body?.type, 20);
    if (!store.TYPES.includes(type)) {
      return res.status(400).json({ error: 'Choose the website, mobile or desktop form.' });
    }

    const leadId = req.body?.leadId ?? null;
    const leadEmail = clean(req.body?.leadEmail, 200);

    try {
      const { request, reused } = await store.createOrReuseRequest({
        type,
        leadId,
        leadEmail,
        leadName: clean(req.body?.leadName, 200),
        company: clean(req.body?.company, 200),
        agent: session.name || '',
        agentEmail: session.email
      });

      return res.status(200).json({
        ok: true,
        ...(reused ? { reused: true } : {}),
        link: {
          type,
          label: store.labelFor(type),
          token: request.token,
          url: `${origin}/#/requirements/${request.token}`
        }
      });
    } catch (err) {
      return res.status(500).json({ error: `Could not create the ${type} form link: ${err.message}` });
    }
  }

  // ── staff: list the forms that were sent and the answers that came back ──
  if (req.method === 'GET') {
    const requests = await store.listVisible(session, auth.isReviewer(session));
    const submitted = requests.filter((request) => request.submittedAt);
    return res.status(200).json({
      ok: true,
      count: requests.length,
      pending: requests.length - submitted.length,
      submitted: submitted.length,
      requests
    });
  }

  // ── admin: delete chosen forms, which also retires their public links ──
  if (req.method === 'DELETE') {
    if (!auth.isAdmin(session)) {
      return res.status(403).json({ error: 'Only an admin can delete requirements forms.' });
    }

    const tokens = Array.isArray(req.body?.tokens)
      ? req.body.tokens.map((value) => clean(value, 64)).filter(Boolean).slice(0, 400)
      : [];
    if (!tokens.length) return res.status(400).json({ error: 'Choose at least one form to delete.' });

    const removed = await store.deleteRequests(tokens);
    return res.status(200).json({ ok: true, removed, requested: tokens.length });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Use GET, POST or DELETE.' });
  }
};
