// One record per requirements form we send: who it went to, which template, and the answers
// that come back when the customer opens the link. Lives in the same Postgres key/value table
// as accounts and reply assignments.
const crypto = require('crypto');
const kv = require('./kv-store');

const KEY = 'omnisales:requirement-requests';
const LIMIT = 400;
const TYPES = ['website', 'mobile', 'desktop'];

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
const createRequest = async ({ type, leadEmail, leadName, company, agent, agentEmail }) => {
  if (!TYPES.includes(type)) throw new Error('Unknown requirements form.');

  const token = crypto.randomBytes(9).toString('base64url');
  const all = await listAll();

  all[token] = {
    token,
    type,
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

// Admin sees everything; an agent sees the forms they sent
const listVisible = async (session, isAdmin) => {
  const all = await listAll();
  const email = cleanEmail(session?.email);
  const name = String(session?.name || '').toLowerCase();

  return Object.values(all)
    .filter((request) => isAdmin || request.agentEmail === email || String(request.agent || '').toLowerCase() === name)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
};

module.exports = { configured, createRequest, getRequest, saveAnswers, listVisible, publicRequest, TYPES };
