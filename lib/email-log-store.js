// The delivery log every device reads: which message went out, to whom, and from which address
// (and how that From was decided). It lives in the shared key/value table so a cold start does
// not erase it and a second device sees the same history as the one that sent the message.
const kv = require('./kv-store');

const KEY = 'omnisales:email-log';
const LIMIT = 300;

const listAll = async () => {
  try {
    const rows = await kv.read(KEY, []);
    return Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
  } catch (err) {
    console.error('Could not read the delivery log:', err.message);
    return [];
  }
};

// A send is written once and may be written again when its status changes, so an entry with the
// same id replaces the earlier copy rather than appearing twice
const record = async (entry) => {
  if (!entry || typeof entry !== 'object' || !entry.id) return null;

  const rows = await listAll();
  const next = [{ ...entry }, ...rows.filter((row) => row.id !== entry.id)]
    .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')))
    .slice(0, LIMIT);

  await kv.write(KEY, next);
  return entry;
};

const list = async (limit = 50) => (await listAll()).slice(0, limit);

module.exports = {
  record,
  list,
  configured: () => kv.configured()
};
