// One record per requirements form we send: who it went to, which template, and the answers
// that come back when the customer opens the link. Lives in the same Postgres key/value table
// as accounts and reply assignments.
const crypto = require('crypto');
const kv = require('./kv-store');

const KEY = 'omnisales:requirement-requests';
const LIMIT = 400;
const TYPES = ['website', 'mobile', 'desktop'];

// What each form is called in the email that carries its link
const LABELS = {
  website: 'Website project requirements',
  mobile: 'Mobile app requirements',
  desktop: 'Desktop app requirements'
};

const labelFor = (type) => LABELS[type] || 'Project requirements';

const configured = () => kv.configured();

const cleanEmail = (value = '') => String(value).trim().toLowerCase();

const listAll = async () => {
  try {
    const rows = await kv.read(KEY, {});
    return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
  } catch (err) {
    console.error('Could not read requirements:', err.message);
    return {};
  }
};

const publicRequest = (request) => ({
  token: request.token,
  type: request.type,
  leadName: request.leadName || '',
  company: request.company || '',
  agent: request.agent || '',
  createdAt: request.createdAt,
  submittedAt: request.submittedAt || null
});

// The shape of one form record: a short unguessable token is the only credential the public
// page needs.
const recordFor = ({ type, leadId = null, leadEmail, leadName, company, agent, agentEmail }) => ({
  token: crypto.randomBytes(9).toString('base64url'),
  type,
  leadId: leadId ?? null,
  leadEmail: cleanEmail(leadEmail),
  leadName: String(leadName || '').trim(),
  company: String(company || '').trim(),
  agent: agent || '',
  agentEmail: cleanEmail(agentEmail),
  createdAt: new Date().toISOString(),
  submittedAt: null,
  details: null,
  answers: null
});

// Records are inserted in order, so trimming the tail drops the oldest form rather than the one
// an agent just created
const trimmed = (all) => Object.fromEntries(Object.entries(all).slice(-LIMIT));

const currentMap = (all) => (all && typeof all === 'object' && !Array.isArray(all) ? all : {});

// Always a new record; the reuse rules live in createOrReuseRequest
const createRequest = async (payload = {}) => {
  if (!TYPES.includes(payload.type)) throw new Error('Unknown requirements form.');

  const request = recordFor(payload);
  await kv.update(KEY, {}, (all) => {
    const current = currentMap(all);
    current[request.token] = request;
    return trimmed(current);
  });
  return request;
};

const getRequest = async (token) => {
  const all = await listAll();
  return all[String(token || '').trim()] || null;
};

// A form belongs to a lead by id, or by the address it was sent to when the lead record was
// replaced by a fresh search hit with a new id.
const matchesLead = (request, { leadId, leadEmail }) => {
  const email = cleanEmail(leadEmail);
  const idMatch =
    leadId !== null &&
    leadId !== undefined &&
    String(leadId) !== '' &&
    String(request.leadId ?? '') === String(leadId);
  const emailMatch = Boolean(email) && cleanEmail(request.leadEmail) === email;
  return idMatch || emailMatch;
};

// The answer to "does this lead already have this form?": the same form must not be sent twice,
// so a link is only minted when this returns nothing.
const findForLead = async ({ leadId, leadEmail, type }) => {
  if (!TYPES.includes(type)) return null;
  const all = await listAll();
  return (
    Object.values(all)
      .filter((request) => request.type === type && matchesLead(request, { leadId, leadEmail }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null
  );
};

// A second click, email or agent must not mint a second form for the same lead and type. The
// lookup and the insert happen inside one locked read-modify-write, so two clicks arriving
// together cannot both find nothing and both create. Shared by the email path and the dialler.
const createOrReuseRequest = async (payload = {}) => {
  if (!TYPES.includes(payload.type)) throw new Error('Unknown requirements form.');

  const { type, leadId = null, leadEmail } = payload;
  let outcome = null;

  await kv.update(KEY, {}, (all) => {
    const current = currentMap(all);

    const existing =
      Object.values(current)
        .filter((request) => request.type === type && matchesLead(request, { leadId, leadEmail }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;

    if (existing) {
      outcome = { request: existing, reused: true };
      // null: nothing changed, so the 400-record map is not written back for a reused link
      return null;
    }

    const request = recordFor(payload);
    current[request.token] = request;
    outcome = { request, reused: false };
    return trimmed(current);
  });

  return outcome;
};

// One link per form type, newest first, so the dialler shows what was already sent instead of
// offering to create a duplicate.
const linksForLead = async ({ leadId, leadEmail, origin }) => {
  const all = await listAll();
  const seen = new Set();

  return Object.values(all)
    .filter((request) => matchesLead(request, { leadId, leadEmail }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .filter((request) => {
      if (seen.has(request.type)) return false;
      seen.add(request.type);
      return true;
    })
    .map((request) => ({
      type: request.type,
      label: labelFor(request.type),
      token: request.token,
      url: `${origin}/#/requirements/${request.token}`,
      createdAt: request.createdAt,
      submittedAt: request.submittedAt || null
    }));
};

// On the same locked path as the mint, so a customer submitting while an agent copies a link
// cannot overwrite the record that click just created
const saveAnswers = async (token, { details, answers, notes }) => {
  const key = String(token || '').trim();
  let saved = null;

  const cleanAnswers = {};
  if (answers && typeof answers === 'object') {
    Object.entries(answers).forEach(([sectionId, value]) => {
      const picked = Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
      if (picked.length) cleanAnswers[sectionId] = picked.slice(0, 80);
    });
  }

  await kv.update(KEY, {}, (all) => {
    const current = currentMap(all);
    const request = current[key];
    if (!request) return current;

    current[key] = {
      ...request,
      details: details && typeof details === 'object' ? details : {},
      answers: cleanAnswers,
      notes: String(notes || '').slice(0, 4000),
      submittedAt: new Date().toISOString(),
      submitCount: (request.submitCount || 0) + 1
    };
    saved = current[key];
    return current;
  });

  return saved;
};

// Admin only. Removing a form also invalidates its public link, because the token is the
// record: a customer opening it afterwards gets "link is not valid any more".
const deleteRequests = async (tokens = []) => {
  const keys = tokens.map((token) => String(token || '').trim()).filter(Boolean);
  if (!keys.length) return 0;

  let removed = 0;
  await kv.update(KEY, {}, (all) => {
    const current = currentMap(all);
    keys.forEach((key) => {
      if (!current[key]) return;
      delete current[key];
      removed += 1;
    });
    return current;
  });

  return removed;
};

// Admin and analyst see everything; an agent sees the forms they sent
const listVisible = async (session, seesAll) => {
  const all = await listAll();
  const email = cleanEmail(session?.email);
  const name = String(session?.name || '').toLowerCase();

  return Object.values(all)
    .filter((request) => seesAll || request.agentEmail === email || String(request.agent || '').toLowerCase() === name)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
};

module.exports = {
  configured,
  createRequest,
  createOrReuseRequest,
  getRequest,
  findForLead,
  linksForLead,
  saveAnswers,
  listVisible,
  deleteRequests,
  publicRequest,
  labelFor,
  TYPES,
  LABELS
};
