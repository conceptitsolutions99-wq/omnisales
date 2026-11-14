// Requirements forms: the customer opens ?token=... on the public page and ticks what they
// want; staff read the answers in the app. The token is the only credential the customer
// needs, so those two paths stay open and everything else requires a session.
const auth = require('../lib/auth-core');
const store = require('../lib/requirements-store');

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

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
    return res.status(200).json({ ok: true, submittedAt: saved.submittedAt });
  }

  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  // ── staff: list the forms that were sent and the answers that came back ──
  if (req.method === 'GET') {
    const requests = await store.listVisible(session, auth.isAdmin(session));
    const submitted = requests.filter((request) => request.submittedAt);
    return res.status(200).json({
      ok: true,
      count: requests.length,
      pending: requests.length - submitted.length,
      submitted: submitted.length,
      requests
    });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }
};
