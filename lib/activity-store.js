// The team's outreach history: every call and email that was logged, shared so the admin sees
// what the whole team did. Each entry is credited to the employee whose session recorded it.
const kv = require('./kv-store');

const KEY = 'omnisales:activity';
const LIMIT = 2000;

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

// Reading already collapses history that was stored twice before this rule existed
const listActivity = async () => dedupe(await listAll());

// The name on an entry is the signed-in employee's: a browser cannot credit a colleague
const addActivity = async (entries, actor) => {
  if (!Array.isArray(entries) || entries.length === 0) return listAll();

  const existing = await listAll();
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
    if (seen.has(key)) continue;
    seen.add(key);
    additions.push(credited);
  }

  if (additions.length === 0) return existing;

  const next = dedupe(
    [...additions, ...existing].sort((a, b) =>
      String(b.timestamp || b.recordedAt || '').localeCompare(String(a.timestamp || a.recordedAt || ''))
    )
  ).slice(0, LIMIT);

  await kv.write(KEY, next);
  return next;
};

module.exports = { listActivity, addActivity };
