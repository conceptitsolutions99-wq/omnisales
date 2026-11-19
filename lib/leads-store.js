// The team's one lead list. Every browser works from this store, so a send by an employee is
// visible to the admin, and each status change records who made it.
// Lives in the same Postgres key/value table as accounts and reply assignments.
const kv = require('./kv-store');

const KEY = 'omnisales:leads';
// A deleted lead has to stay gone even though every open browser still holds a copy of the list:
// the key is remembered for a day so that copy is dropped instead of being pushed back
const DELETED_KEY = 'omnisales:leads:deleted';
const TOMBSTONE_TTL_MS = 24 * 60 * 60 * 1000;
const LIMIT = 2000;

// A lead is the same business whichever provider found it, so its key is the number first,
// then the address, and only then its provider id.
const normalPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
};

// The status only ever moves forward; a follow-up email cannot undo a qualified lead
const STATUS_RANK = {
  New: 0,
  Contacted: 1,
  Considering: 2,
  Qualified: 3,
  'Deal Completed': 4,
  Denied: 4
};

const statusRank = (status) => (status in STATUS_RANK ? STATUS_RANK[status] : 1);

const listAll = async () => {
  try {
    const rows = await kv.read(KEY, {});
    return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
  } catch (err) {
    console.error('Could not read leads:', err.message);
    return {};
  }
};

// A listing that comes from OpenStreetMap carries the map object's own id, which identifies the
// business even when its phone and name are written differently by another employee
const OSM_ID = /^osm-(node|way|relation)-\d+$/;
const osmIdOf = (lead) => (OSM_ID.test(String(lead.id || '')) ? String(lead.id) : '');

const leadKey = (lead) => {
  const phone = normalPhone(lead.phone);
  if (phone) return `phone:${phone}`;
  const email = String(lead.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  return `id:${String(lead.id || '').trim()}`;
};

const readTombstones = async () => {
  try {
    const raw = await kv.read(DELETED_KEY, {});
    const now = Date.now();
    const fresh = {};
    for (const [key, at] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
      if (Number(at) && now - Number(at) < TOMBSTONE_TTL_MS) fresh[key] = Number(at);
    }
    return fresh;
  } catch (err) {
    return {};
  }
};

// Every key a lead can be recognised by: its phone/email/id key, its raw id and its map object
const tombstoneKeys = (lead) => {
  const keys = new Set([leadKey(lead)]);
  if (lead?.id) keys.add(`id:${String(lead.id).trim()}`);
  const osm = osmIdOf(lead) || (lead?.osmId ? String(lead.osmId).trim() : '');
  if (osm) keys.add(`osm:${osm}`);
  return [...keys].filter(Boolean);
};

const listDeleted = async () => Object.keys(await readTombstones());

const listLeads = async () => {
  const all = await listAll();
  return Object.values(all).sort(
    (a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
  );
};

// Fields where what is already known wins, and a newly discovered value fills a blank
// The contact channels a lead has are as important as the phone: a mobile/WhatsApp number and a
// social page found later must survive the merge into the shared list
const FILL_FIELDS = [
  'name', 'company', 'phone', 'displayPhone', 'mobile', 'whatsapp', 'email', 'website',
  'facebook', 'instagram', 'linkedin',
  'address', 'country', 'region', 'size', 'solution', 'notes', 'createdAt', 'lat', 'lon'
];

const mergeLead = (existing, incoming, actor) => {
  if (!existing) {
    return {
      ...incoming,
      osmId: osmIdOf(incoming) || incoming.osmId || '',
      createdBy: actor.name || '',
      createdByEmail: actor.email || '',
      updatedAt: new Date().toISOString()
    };
  }

  const merged = { ...existing };

  for (const field of FILL_FIELDS) {
    const next = incoming[field];
    const current = existing[field];
    const nextFilled = next !== undefined && next !== null && next !== '';
    const currentEmpty = current === undefined || current === null || current === '';
    if (nextFilled && currentEmpty) merged[field] = next;
  }

  if (Array.isArray(incoming.altEmails) && incoming.altEmails.length > 0 && !existing.altEmails?.length) {
    merged.altEmails = incoming.altEmails;
  }

  if (!merged.value && incoming.value) merged.value = incoming.value;

  // A contact is attributed to whoever reached the lead, even when the address was typed by
  // hand in an earlier session
  const incomingContacted = incoming.contactedAt || '';
  if (incomingContacted && incomingContacted > (existing.contactedAt || '')) {
    merged.contactedAt = incomingContacted;
    merged.contactedBy = incoming.contactedBy || actor.name || '';
  } else if (existing.contactedBy) {
    merged.contactedBy = existing.contactedBy;
    merged.contactedAt = existing.contactedAt;
  }

  if (statusRank(incoming.status) > statusRank(existing.status)) {
    merged.status = incoming.status;
    merged.statusBy = actor.name || '';
    merged.statusByEmail = actor.email || '';
    merged.statusAt = new Date().toISOString();
  } else if (existing.statusBy) {
    merged.statusBy = existing.statusBy;
    merged.statusByEmail = existing.statusByEmail || '';
    merged.statusAt = existing.statusAt;
  }

  merged.updatedAt = new Date().toISOString();
  return merged;
};

// Takes whatever a browser has and folds it in: nothing another employee has recorded is lost,
// and every status change carries the name of the employee who made it.
const upsertLeads = async (leads, actor) => {
  if (!Array.isArray(leads) || leads.length === 0) return listLeads();

  const all = await listAll();
  const tombstones = await readTombstones();
  let changed = 0;

  for (const lead of leads) {
    if (!lead || typeof lead !== 'object') continue;
    const key = leadKey(lead);
    if (!key || key === 'id:') continue;
    // An admin deleted this business, so a browser that still has it cannot put it back
    if (tombstoneKeys(lead).some((entry) => tombstones[entry])) continue;

    // Same business reached by a different route: the map object identifies it
    let targetKey = key;
    if (!all[key]) {
      const osm = osmIdOf(lead);
      if (osm) {
        const matchKey = Object.keys(all).find(
          (stored) => all[stored].osmId === osm || String(all[stored].id) === osm
        );
        if (matchKey) targetKey = matchKey;
      }
    }

    all[targetKey] = mergeLead(all[targetKey], lead, actor);
    changed += 1;
  }

  const entries = Object.entries(all);
  const trimmed =
    entries.length > LIMIT
      ? Object.fromEntries(
          entries
            .sort((a, b) => String(b[1].updatedAt || '').localeCompare(String(a[1].updatedAt || '')))
            .slice(0, LIMIT)
        )
      : all;

  await kv.write(KEY, trimmed);
  return listLeads();
};

// Removes the given leads from the shared list and remembers their keys so a stale browser
// copy cannot resurrect them on its next push.
const deleteLeads = async (leads) => {
  if (!Array.isArray(leads) || leads.length === 0) return listLeads();

  const all = await listAll();
  const tombstones = await readTombstones();
  const now = Date.now();

  for (const lead of leads) {
    if (!lead || typeof lead !== 'object') continue;
    const keys = tombstoneKeys(lead);
    for (const key of keys) tombstones[key] = now;

    const phone = normalPhone(lead.phone);
    const email = String(lead.email || '').trim().toLowerCase();

    for (const [storedKey, stored] of Object.entries(all)) {
      const same =
        keys.includes(storedKey) ||
        (lead.id && String(stored.id) === String(lead.id)) ||
        (phone && normalPhone(stored.phone) === phone) ||
        (email && String(stored.email || '').trim().toLowerCase() === email) ||
        (lead.osmId && stored.osmId && stored.osmId === lead.osmId);

      if (!same) continue;
      tombstones[storedKey] = now;
      delete all[storedKey];
    }
  }

  await kv.write(KEY, all);
  await kv.write(DELETED_KEY, tombstones);
  return listLeads();
};

module.exports = {
  listLeads,
  upsertLeads,
  deleteLeads,
  listDeleted,
  configured: () => kv.configured()
};
