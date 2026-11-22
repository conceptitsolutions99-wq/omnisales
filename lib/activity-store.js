// The team's outreach history: every call and email that was logged, shared so the admin sees
// what the whole team did. Each entry is credited to the employee whose session recorded it.
const kv = require('./kv-store');

const KEY = 'omnisales:activity';
// Keys of entries an admin deleted. Every browser keeps its own copy of the history, so without a
// tombstone the next sync from the employee who recorded an entry would put it straight back.
const DELETED_KEY = 'omnisales:activity-deleted';
const LIMIT = 2000;
const MAX_TOMBSTONES = 5000;

const listAll = async () => {
  try {
    const rows = await kv.read(KEY, []);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error('Could not read activity:', err.message);
    return [];
  }
};

// One event is one row. The same send arrives twice: once from the browser that made it and
// once from the copy it read back. Those two copies share the entry's id, so the id identifies
// the event; two genuinely separate sends have different ids and both stay.
// An entry without an id (older rows) falls back to its content and minute.
const entryKey = (entry) => {
  const id = entry.id;
  if (id !== undefined && id !== null && id !== '') {
    return `id:${id}|${String(entry.leadName || entry.company || '').toLowerCase()}`;
  }
  return [
    String(entry.channel || '').toLowerCase(),
    String(entry.leadName || entry.company || '').toLowerCase(),
    String(entry.notes || entry.subject || '').toLowerCase(),
    String(entry.timestamp || entry.recordedAt || '').slice(0, 16)
  ].join('|');
};

const dedupe = (entries) => {
  const seen = new Set();
  const kept = [];
  for (const entry of entries) {
    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(entry);
  }
  return kept;
};

const readTombstones = async () => {
  try {
    const rows = await kv.read(DELETED_KEY, {});
    return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
  } catch (err) {
    console.error('Could not read deleted activity keys:', err.message);
    return {};
  }
};

// The newest keys are the ones a sync can still push back, so an old key may be forgotten
const writeTombstones = async (tombstones) => {
  const newest = Object.entries(tombstones)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, MAX_TOMBSTONES);
  await kv.write(DELETED_KEY, Object.fromEntries(newest));
};

// Reading already collapses history that was stored twice before this rule existed, and drops what
// an admin deleted even if another device pushed its cached copy back afterwards
const listActivity = async () => {
  const [all, tombstones] = await Promise.all([listAll(), readTombstones()]);
  return dedupe(all).filter((entry) => !tombstones[entryKey(entry)]);
};

const listDeletedKeys = async () => Object.keys(await readTombstones());

// The name on an entry is the signed-in employee's: a browser cannot credit a colleague
const addActivity = async (entries, actor) => {
  if (!Array.isArray(entries) || entries.length === 0) return listAll();

  const existing = await listAll();
  const tombstones = await readTombstones();
  const seen = new Set(existing.map(entryKey));
  const additions = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || entry.id === undefined || entry.id === null) continue;

    // An entry that already belongs to a colleague came back from this store; re-crediting it
    // to whoever is pushing would duplicate it under the wrong name
    const owner = String(entry.callerEmail || '').toLowerCase();
    if (owner && owner !== String(actor.email || '').toLowerCase()) continue;

    const credited = {
      ...entry,
      caller: actor.name || entry.caller || '',
      callerEmail: actor.email || '',
      recordedBy: actor.name || '',
      recordedAt: new Date().toISOString()
    };
    const key = entryKey(credited);
    if (seen.has(key) || tombstones[key]) continue;
    seen.add(key);
    additions.push(credited);
  }

  if (additions.length === 0) return existing;

  const next = dedupe(
    [...additions, ...existing].sort((a, b) =>
      String(b.timestamp || b.recordedAt || '').localeCompare(String(a.timestamp || a.recordedAt || ''))
    )
  )
    .filter((entry) => !tombstones[entryKey(entry)])
    .slice(0, LIMIT);

  await kv.write(KEY, next);
  return next;
};

// Admin delete: the selected entries go for the whole team. The request names them by their key
// (an entry without an id still has one) and by id, so either match removes the row.
const deleteActivity = async ({ keys = [], ids = [] } = {}) => {
  const keySet = new Set((Array.isArray(keys) ? keys : []).map(String).filter(Boolean));
  const idSet = new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean));
  if (keySet.size === 0 && idSet.size === 0) return listActivity();

  const [all, tombstones] = await Promise.all([listAll(), readTombstones()]);
  const now = Date.now();
  const remaining = [];

  for (const entry of all) {
    const key = entryKey(entry);
    const selected = keySet.has(key) || (entry.id !== undefined && entry.id !== null && idSet.has(String(entry.id)));
    if (selected) {
      tombstones[key] = now;
      continue;
    }
    remaining.push(entry);
  }

  await kv.write(KEY, remaining);
  await writeTombstones(tombstones);
  return dedupe(remaining);
};

// Admin undo: the entries just deleted come back for the whole team, still credited to the
// employee who recorded them. Their tombstones are removed first, or the read would drop them
// again as deleted.
const restoreActivity = async (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) return listActivity();

  const [all, tombstones] = await Promise.all([listAll(), readTombstones()]);
  const restored = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    delete tombstones[entryKey(entry)];
    restored.push(entry);
  }
  if (restored.length === 0) return listActivity();

  const next = dedupe(
    [...restored, ...all].sort((a, b) =>
      String(b.timestamp || b.recordedAt || '').localeCompare(String(a.timestamp || a.recordedAt || ''))
    )
  )
    .filter((entry) => !tombstones[entryKey(entry)])
    .slice(0, LIMIT);

  await kv.write(KEY, next);
  await writeTombstones(tombstones);
  return next;
};

// Admin reset: the history is shared, so clearing it removes every entry for every device. The
// tombstone keeps a browser that still holds a copy from pushing it back. The removed rows are
// returned so the admin's undo can put them back for the whole team.
const clearActivity = async () => {
  const [all, tombstones] = await Promise.all([listAll(), readTombstones()]);
  const now = Date.now();
  for (const entry of all) tombstones[entryKey(entry)] = now;

  await kv.write(KEY, []);
  await writeTombstones(tombstones);
  return dedupe(all);
};

module.exports = {
  listActivity,
  listDeletedKeys,
  addActivity,
  deleteActivity,
  restoreActivity,
  clearActivity
};
