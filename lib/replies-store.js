// Reply attribution has to survive restarts and be shared by every instance, so the app
// records what it sent and which employee the admin has assigned a reply to. Same Upstash
// Redis instance as the account store, with a memory fallback for local work.
const SENT_KEY = 'omnisales:sent-index';
const ASSIGN_KEY = 'omnisales:reply-assignments';
const SENT_LIMIT = 400;
const ASSIGN_LIMIT = 500;

const baseUrl = () => (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || '';
const configured = () => Boolean(baseUrl() && token());

const memory = new Map();

const redis = async (path, options = {}) => {
  const response = await fetch(`${baseUrl()}/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token()}`, ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`Reply store error (${response.status}).`);
  return response.json();
};

const read = async (key, fallback) => {
  if (!configured()) return memory.has(key) ? memory.get(key) : fallback;
  try {
    const data = await redis(`get/${encodeURIComponent(key)}`);
    if (!data.result) return fallback;
    const parsed = JSON.parse(data.result);
    return parsed ?? fallback;
  } catch (err) {
    console.error('Could not read reply attribution:', err.message);
    return fallback;
  }
};

const write = async (key, value) => {
  if (!configured()) {
    memory.set(key, value);
    return;
  }
  await redis(`set/${encodeURIComponent(key)}`, { method: 'POST', body: JSON.stringify(value) });
};

const cleanId = (value = '') => String(value).replace(/[<>]/g, '').trim();
const cleanEmail = (value = '') => String(value).trim().toLowerCase();

/* ───────────────────────  what the app actually sent  ─────────────────────── */

const listSent = async () => {
  const rows = await read(SENT_KEY, []);
  return Array.isArray(rows) ? rows : [];
};

// Newest first, so a recipient match picks the most recent message to that customer
const rememberSent = async ({ messageId, agent, agentEmail, leadName, to, subject, sentAt }) => {
  const id = cleanId(messageId);
  const recipient = cleanEmail(to);
  if (!id && !recipient) return null;

  const entry = {
    messageId: id,
    agent: agent || '',
    agentEmail: cleanEmail(agentEmail),
    leadName: leadName || '',
    to: recipient,
    subject: subject || '',
    sentAt: sentAt || new Date().toISOString()
  };

  try {
    const rows = await listSent();
    const next = [entry, ...rows.filter((row) => !(id && cleanId(row.messageId) === id))].slice(0, SENT_LIMIT);
    await write(SENT_KEY, next);
  } catch (err) {
    console.error('Could not record the sent message:', err.message);
  }
  return entry;
};

/* ──────────────────────  who the admin assigned a reply to  ────────────────────── */

const listAssignments = async () => {
  const rows = await read(ASSIGN_KEY, {});
  return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
};

const setAssignment = async (replyId, assignment) => {
  const id = String(replyId || '').trim();
  if (!id) throw new Error('A reply id is required.');

  const all = await listAssignments();
  if (assignment) all[id] = assignment;
  else delete all[id];

  const trimmed = Object.fromEntries(Object.entries(all).slice(-ASSIGN_LIMIT));
  await write(ASSIGN_KEY, trimmed);
  return assignment || null;
};

module.exports = { configured, listSent, rememberSent, listAssignments, setAssignment };
