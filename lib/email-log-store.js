// The delivery log every device reads: which message went out, to whom, and from which address
// (and how that From was decided). It lives in the shared key/value table so a cold start does
// not erase it and a second device sees the same history as the one that sent the message.
const kv = require('./kv-store');

const KEY = 'omnisales:email-log';
const DELETED_KEY = 'omnisales:email-log-deleted';
const LIMIT = 300;
const DELETED_LIMIT = 2000;

// An admin can remove a delivery from the log, and the log is the only record a send ever left.
// A browser keeps its own copy of the sends it made, so the ids that were deleted travel with the
// log: that copy drops them instead of merging them back on the next read.
const readDeleted = async () => {
  try {
    const ids = await kv.read(DELETED_KEY, []);
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch (err) {
    console.error('Could not read the deleted delivery ids:', err.message);
    return [];
  }
};

const listAll = async () => {
  try {
    const [rows, deleted] = await Promise.all([kv.read(KEY, []), readDeleted()]);
    if (!Array.isArray(rows)) return [];
    const gone = new Set(deleted);
    return rows.filter((row) => row && typeof row === 'object' && !gone.has(String(row.id)));
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

// Removing rows is an admin action: the caller checks the role, this only does the work. The ids
// are recorded before the rows are dropped, so a copy that still holds the row (a warm instance, a
// browser's own log) cannot bring it back.
const deleteEntries = async (ids) => {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))].slice(0, 500);
  if (wanted.length === 0) return listAll();

  await kv.update(DELETED_KEY, [], (current) =>
    [...new Set([...wanted, ...(Array.isArray(current) ? current.map(String) : [])])].slice(0, DELETED_LIMIT)
  );
  await kv.update(KEY, [], (current) =>
    (Array.isArray(current) ? current : []).filter(
      (row) => !row || typeof row !== 'object' || !wanted.includes(String(row.id))
    )
  );

  return listAll();
};

module.exports = {
  record,
  list,
  deleteEntries,
  deletedIds: readDeleted,
  configured: () => kv.configured()
};
