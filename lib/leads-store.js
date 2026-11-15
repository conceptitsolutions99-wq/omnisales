// The team's one lead list. Every browser works from this store, so a send by an employee is
// visible to the admin, and each status change records who made it.
// Lives in the same Postgres key/value table as accounts and reply assignments.
const kv = require('./kv-store');

const KEY = 'omnisales:leads';
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

const listLeads = async () => {
  const all = await listAll();
  return Object.values(all).sort(
    (a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
  );
};

// Fields where what is already known wins, and a newly discovered value fills a blank
const FILL_FIELDS = [
  'name', 'company', 'phone', 'displayPhone', 'email', 'website', 'facebook', 'instagram',
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
  let changed = 0;

  for (const lead of leads) {
    if (!lead || typeof lead !== 'object') continue;
    const key = leadKey(lead);
    if (!key || key === 'id:') continue;

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

module.exports = { listLeads, upsertLeads, configured: () => kv.configured() };
