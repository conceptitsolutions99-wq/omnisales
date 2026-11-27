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

const readTombstones = async (readValue = kv.read) => {
  try {
    const rows = await readValue(DELETED_KEY, {});
    return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
  } catch (err) {
    console.error('Could not read deleted activity keys:', err.message);
    return {};
  }
};

// The newest keys are the ones a sync can still push back, so an old key may be forgotten. The
// merge runs under the tombstone row's own lock, so two deletes at once keep both sets of keys.
const mergeTombstones = async (added = {}) => {
  if (Object.keys(added).length === 0) return;
  await kv.update(DELETED_KEY, {}, (current) => {
    const existing = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    const newest = Object.entries({ ...existing, ...added })
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, MAX_TOMBSTONES);
    return Object.fromEntries(newest);
  });
};

const unsetTombstones = async (keys = []) => {
  if (keys.length === 0) return;
  await kv.update(DELETED_KEY, {}, (current) => {
    const existing = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    let changed = false;
    for (const key of keys) {
      if (key in existing) {
        delete existing[key];
        changed = true;
      }
    }
    return changed ? existing : null;
  });
};

// Reading already collapses history that was stored twice before this rule existed, and drops what
// an admin deleted even if another device pushed its cached copy back afterwards
const listActivity = async () => {
  const [all, tombstones] = await Promise.all([listAll(), readTombstones()]);
  return dedupe(all).filter((entry) => !tombstones[entryKey(entry)]);
};

const listDeletedKeys = async () => Object.keys(await readTombstones());

// The name on an entry is the signed-in employee's: a browser cannot credit a colleague
// The read and the write happen under the row lock: two employees logging a call at the same
// moment both keep their entry, and the deleted keys are read inside the lock so a push carrying
// a copy made before an admin's delete cannot put that entry back.
const addActivity = async (entries, actor) => {
  if (!Array.isArray(entries) || entries.length === 0) return listAll();

  return kv.update(KEY, [], async (current, locked) => {
  const existing = Array.isArray(current) ? current : [];
  const tombstones = await readTombstones(locked.read);
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

  if (additions.length === 0) return null;

  return dedupe(
    [...additions, ...existing].sort((a, b) =>
      String(b.timestamp || b.recordedAt || '').localeCompare(String(a.timestamp || a.recordedAt || ''))
    )
  )
    .filter((entry) => !tombstones[entryKey(entry)])
    .slice(0, LIMIT);
  });
};

// Admin delete: the selected entries go for the whole team. The request names them by their key
// (an entry without an id still has one) and by id, so either match removes the row.
const deleteActivity = async ({ keys = [], ids = [] } = {}) => {
  const keySet = new Set((Array.isArray(keys) ? keys : []).map(String).filter(Boolean));
  const idSet = new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean));
  if (keySet.size === 0 && idSet.size === 0) return listActivity();

  const now = Date.now();
  const removed = {};

  const remaining = await kv.update(KEY, [], (current) => {
    const all = Array.isArray(current) ? current : [];
    const keep = [];
    for (const entry of all) {
      const key = entryKey(entry);
      const selected = keySet.has(key) || (entry.id !== undefined && entry.id !== null && idSet.has(String(entry.id)));
      if (selected) {
        removed[key] = now;
        continue;
      }
      keep.push(entry);
    }
    return Object.keys(removed).length > 0 ? keep : null;
  });

  // The tombstones are written after the rows are gone, so a browser still holding the entry
  // cannot push it back; merging them under their own lock keeps a second delete's keys too
  await mergeTombstones(removed);
  return dedupe(remaining);
};

// Admin undo: the entries just deleted come back for the whole team, still credited to the
// employee who recorded them. Their tombstones are removed first, or the read would drop them
// again as deleted.
const restoreActivity = async (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) return listActivity();

  const restored = entries.filter((entry) => entry && typeof entry === 'object');
  if (restored.length === 0) return listActivity();

  // Their tombstones go first, or the read below would drop the restored entries again as deleted
  await unsetTombstones(restored.map(entryKey));

  return kv.update(KEY, [], async (current, locked) => {
    const all = Array.isArray(current) ? current : [];
    const tombstones = await readTombstones(locked.read);
    return dedupe(
      [...restored, ...all].sort((a, b) =>
        String(b.timestamp || b.recordedAt || '').localeCompare(String(a.timestamp || a.recordedAt || ''))
      )
    )
      .filter((entry) => !tombstones[entryKey(entry)])
      .slice(0, LIMIT);
  });
};

// Admin reset: the history is shared, so clearing it removes every entry for every device. The
// tombstone keeps a browser that still holds a copy from pushing it back. The removed rows are
// returned so the admin's undo can put them back for the whole team.
const clearActivity = async () => {
  const now = Date.now();
  const cleared = {};
  let removed = [];

  await kv.update(KEY, [], (current) => {
    removed = Array.isArray(current) ? current : [];
    for (const entry of removed) cleared[entryKey(entry)] = now;
    return [];
  });

  await mergeTombstones(cleared);
  return dedupe(removed);
};

module.exports = {
  listActivity,
  listDeletedKeys,
  addActivity,
  deleteActivity,
  restoreActivity,
  clearActivity
};
