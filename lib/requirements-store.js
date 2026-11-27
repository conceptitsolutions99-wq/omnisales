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

// A short unguessable token is the only credential the public page needs
const createRequest = async ({ type, leadEmail, leadName, company, agent, agentEmail, leadId = null }) => {
  if (!TYPES.includes(type)) throw new Error('Unknown requirements form.');

  const token = crypto.randomBytes(9).toString('base64url');
  const all = await listAll();

  all[token] = {
    token,
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
  };

  const trimmed = Object.entries(all).slice(-LIMIT);
  await kv.write(KEY, Object.fromEntries(trimmed));
  return all[token];
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

// A second email that ticks the same form type has to carry the link the lead already has, not
// a new record the Requirements panel would list as a duplicate. One function for both send
// paths and the dialler, so they cannot drift apart.
const createOrReuseRequest = async (payload = {}) => {
  const existing = await findForLead({
    leadId: payload.leadId,
    leadEmail: payload.leadEmail,
    type: payload.type
  });
  if (existing) return { request: existing, reused: true };
  return { request: await createRequest(payload), reused: false };
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

const saveAnswers = async (token, { details, answers, notes }) => {
  const all = await listAll();
  const key = String(token || '').trim();
  const request = all[key];
  if (!request) return null;

  const cleanAnswers = {};
  if (answers && typeof answers === 'object') {
    Object.entries(answers).forEach(([sectionId, value]) => {
      const picked = Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
      if (picked.length) cleanAnswers[sectionId] = picked.slice(0, 80);
    });
  }

  all[key] = {
    ...request,
    details: details && typeof details === 'object' ? details : {},
    answers: cleanAnswers,
    notes: String(notes || '').slice(0, 4000),
    submittedAt: new Date().toISOString(),
    submitCount: (request.submitCount || 0) + 1
  };

  await kv.write(KEY, all);
  return all[key];
};

// Admin only. Removing a form also invalidates its public link, because the token is the
// record: a customer opening it afterwards gets "link is not valid any more".
const deleteRequests = async (tokens = []) => {
  const all = await listAll();
  let removed = 0;

  for (const token of tokens) {
    const key = String(token || '').trim();
    if (!key || !all[key]) continue;
    delete all[key];
    removed += 1;
  }

  if (removed) await kv.write(KEY, all);
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
