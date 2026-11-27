// Reply attribution has to survive restarts and be shared by every instance, so the app
// records what it sent and which employee the admin has assigned a reply to. Both live in
// the Postgres key/value table owned by lib/kv-store.js (DATABASE_URL), with a memory
// fallback for local work.
const kv = require('./kv-store');

const SENT_KEY = 'omnisales:sent-index';
const ASSIGN_KEY = 'omnisales:reply-assignments';
const SENT_LIMIT = 400;
const ASSIGN_LIMIT = 500;

const configured = () => kv.configured();

const cleanId = (value = '') => String(value).replace(/[<>]/g, '').trim();
const cleanEmail = (value = '') => String(value).trim().toLowerCase();

/* ───────────────────────  what the app actually sent  ─────────────────────── */

const listSent = async () => {
  try {
    const rows = await kv.read(SENT_KEY, []);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error('Could not read the sent index:', err.message);
    return [];
  }
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
    // Under the row lock: two sends recorded at once must both reach the index, or a reply to the
    // one that was overwritten cannot be matched back to the message it answers
    await kv.update(SENT_KEY, [], (current) => {
      const rows = Array.isArray(current) ? current : [];
      return [entry, ...rows.filter((row) => !(id && cleanId(row.messageId) === id))].slice(0, SENT_LIMIT);
    });
  } catch (err) {
    console.error('Could not record the sent message:', err.message);
  }
  return entry;
};

/* ──────────────────────  who the admin assigned a reply to  ────────────────────── */

const listAssignments = async () => {
  try {
    const rows = await kv.read(ASSIGN_KEY, {});
    return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
  } catch (err) {
    console.error('Could not read reply assignments:', err.message);
    return {};
  }
};

const setAssignment = async (replyId, assignment) => {
  const id = String(replyId || '').trim();
  if (!id) throw new Error('A reply id is required.');

  // Two admins assigning different replies at the same moment must not write over each other
  await kv.update(ASSIGN_KEY, {}, (current) => {
    const all = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    if (assignment) all[id] = assignment;
    else delete all[id];
    return Object.fromEntries(Object.entries(all).slice(-ASSIGN_LIMIT));
  });

  return assignment || null;
};

module.exports = { configured, listSent, rememberSent, listAssignments, setAssignment };
