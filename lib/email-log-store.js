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

const RETRY_DELAY_MS = 120;

// The list is changed inside kv.update, so the row is read and written while it is locked: two
// agents sending at the same moment append to each other's copy instead of overwriting it.
const write = (entry) =>
  kv.update(KEY, [], (current) => {
    const rows = Array.isArray(current) ? current.filter((row) => row && typeof row === 'object') : [];
    return [{ ...entry }, ...rows.filter((row) => row.id !== entry.id)]
      .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')))
      .slice(0, LIMIT);
  });

// A send is written once and may be written again when its status changes, so an entry with the
// same id replaces the earlier copy rather than appearing twice. A failed write is retried once,
// because the row is the only record that the message left; a second failure is thrown to the
// caller, which reports it with the send's result instead of pretending the log has it.
const record = async (entry) => {
  if (!entry || typeof entry !== 'object' || !entry.id) return null;

  try {
    await write(entry);
  } catch (err) {
    console.error('Could not record the delivery, retrying once:', err.message);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    await write(entry);
  }
  return entry;
};

const list = async (limit = 50) => (await listAll()).slice(0, limit);

module.exports = {
  record,
  list,
  configured: () => kv.configured()
};
