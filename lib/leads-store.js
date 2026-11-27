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
  // A reply is engagement: it outranks Contacted but never pulls back a later stage
  Replied: 2,
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

const readTombstones = async (reader = kv.read) => {
  try {
    const raw = await reader(DELETED_KEY, {});
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
  'address', 'country', 'region', 'size', 'notes', 'createdAt', 'lat', 'lon',
  'repliedAt', 'repliedFrom', 'repliedSubject', 'replyAgent'
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

  // The offer on a lead is an edit rather than a discovery, so it is not a fill field: the tag set
  // in the list has to survive the next push, a change of offer has to stick, and a browser that
  // has not synced yet must not untag the lead with its stale blank copy.
  const solutionAt = String(incoming.solutionAt || '');
  if (solutionAt && solutionAt >= String(existing.solutionAt || '') && incoming.solution !== undefined) {
    merged.solution = incoming.solution || '';
    merged.solutionAt = solutionAt;
    merged.solutionBy = incoming.solutionBy || actor.name || '';
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

const trimToLimit = (all) => {
  const entries = Object.entries(all);
  if (entries.length <= LIMIT) return all;
  return Object.fromEntries(
    entries
      .sort((a, b) => String(b[1].updatedAt || '').localeCompare(String(a[1].updatedAt || '')))
      .slice(0, LIMIT)
  );
};

// Takes whatever a browser has and folds it in: nothing another employee has recorded is lost,
// and every status change carries the name of the employee who made it.
// The merge runs under the row lock, and the deleted keys are read inside it, so a push that
// carries a copy made before an admin's delete cannot put that lead back.
const upsertLeads = async (leads, actor) => {
  if (!Array.isArray(leads) || leads.length === 0) return listLeads();

  await kv.update(KEY, {}, async (current, locked) => {
    const all = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    // Read on the transaction's own connection, so this cannot wait on the lock it is holding
    const tombstones = await readTombstones(locked.read);

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
    }

    return trimToLimit(all);
  });

  return listLeads();
};

// A reply ends the outreach sequence: the lead moves to Replied (unless a later stage already
// applies) and keeps the reply facts, so every device can stop treating it as unanswered.
const markReplied = async (replies) => {
  if (!Array.isArray(replies) || replies.length === 0) return [];

  const changed = [];

  // The lead index and the status change are built inside the row lock: a reply arriving while
  // another agent claims or pushes the same lead would otherwise write over that change
  await kv.update(KEY, {}, (current) => {
    const all = current && typeof current === 'object' && !Array.isArray(current) ? current : {};

    const byEmail = new Map();
    const byName = new Map();
    for (const [key, lead] of Object.entries(all)) {
      const email = String(lead.email || '').trim().toLowerCase();
      if (email) byEmail.set(email, key);
      for (const name of [lead.name, lead.company]) {
        const value = String(name || '').trim().toLowerCase();
        if (value) byName.set(value, key);
      }
    }

    for (const reply of replies) {
      // Only a reply that answers a message we actually sent closes the sequence. An inbox
      // thread that merely comes from a prospect's address proves nothing, and marking it would
      // pause outreach to a lead who never answered us.
      if (!reply || reply.matched !== true) continue;
      const address = String(reply.from || '').trim().toLowerCase();
      const name = String(reply.leadName || '').trim().toLowerCase();
      const key = (address && byEmail.get(address)) || (name && byName.get(name));
      if (!key) continue;

      const lead = all[key];
      if (!lead) continue;
      const receivedAt = reply.receivedAt || new Date().toISOString();
      if (lead.repliedAt && lead.repliedAt >= receivedAt) continue;

      all[key] = {
        ...lead,
        status: statusRank(lead.status) < 2 ? 'Replied' : lead.status,
        repliedAt: receivedAt,
        repliedFrom: address,
        repliedSubject: reply.subject || '',
        replyAgent: reply.agent || '',
        updatedAt: new Date().toISOString()
      };
      changed.push(all[key]);
    }

    // Nothing matched: returning null leaves the row untouched instead of rewriting it on every
    // poll of the shared inbox
    if (changed.length === 0) return null;
    return trimToLimit(all);
  });

  return changed;
};

// The first agent to write to a prospect owns it. A later send never reassigns the lead, so
// ownership records who started the conversation rather than who touched it last.
const claimLead = async (lead, actor) => {
  if (!lead || !actor) return null;

  let claimed = null;

  // Lookup and claim happen under the row lock, so two agents emailing the same prospect at the
  // same moment cannot each write their own copy of the list and drop the other's changes
  await kv.update(KEY, {}, (current) => {
    const all = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    const id = lead.id !== null && lead.id !== undefined ? String(lead.id) : '';
    const email = String(lead.email || '').trim().toLowerCase();
    const key = Object.keys(all).find(
      (stored) =>
        (id && String(all[stored].id) === id) ||
        (email && String(all[stored].email || '').trim().toLowerCase() === email)
    );

    if (!key) return null;

    // First claim sticks: a second agent does not take the lead over by emailing it
    if (all[key].owner) {
      claimed = all[key];
      return null;
    }

    all[key] = {
      ...all[key],
      owner: actor.name || '',
      ownerEmail: actor.email || '',
      ownedAt: new Date().toISOString()
    };
    claimed = all[key];
    return trimToLimit(all);
  });

  return claimed;
};

// The same business seen from the browser's copy and from a stored row
const sameLead = (lead, storedKey, stored, keys) => {
  const phone = normalPhone(lead.phone);
  const email = String(lead.email || '').trim().toLowerCase();
  return (
    keys.includes(storedKey) ||
    (lead.id && String(stored.id) === String(lead.id)) ||
    (phone && normalPhone(stored.phone) === phone) ||
    (email && String(stored.email || '').trim().toLowerCase() === email) ||
    (lead.osmId && stored.osmId && stored.osmId === lead.osmId)
  );
};

// Removes the given leads from the shared list and remembers their keys so a stale browser
// copy cannot resurrect them on its next push.
// Both writes take the row lock and the deleted keys are written first: a push that starts after
// them is refused by the merge, and one that lands in between has its row removed here.
const deleteLeads = async (leads) => {
  if (!Array.isArray(leads) || leads.length === 0) return listLeads();

  const now = Date.now();

  await kv.update(DELETED_KEY, {}, (current) => {
    const tombstones = { ...(current && typeof current === 'object' ? current : {}) };
    for (const lead of leads) {
      if (!lead || typeof lead !== 'object') continue;
      for (const key of tombstoneKeys(lead)) tombstones[key] = now;
    }
    return tombstones;
  });

  const removedKeys = new Set();
  await kv.update(KEY, {}, (current) => {
    const all = { ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}) };
    for (const lead of leads) {
      if (!lead || typeof lead !== 'object') continue;
      const keys = tombstoneKeys(lead);
      for (const [storedKey, stored] of Object.entries(all)) {
        if (!sameLead(lead, storedKey, stored, keys)) continue;
        removedKeys.add(storedKey);
        delete all[storedKey];
      }
    }
    return all;
  });

  // The row's own key is remembered too, so a copy that knows the lead by that key is dropped
  if (removedKeys.size > 0) {
    await kv.update(DELETED_KEY, {}, (current) => {
      const tombstones = { ...(current && typeof current === 'object' ? current : {}) };
      for (const key of removedKeys) tombstones[key] = now;
      return tombstones;
    });
  }

  return listLeads();
};

// Undo of a delete: forget the tombstones for these leads and put them back, so every open
// browser sees them again instead of dropping them as deleted.
const restoreLeads = async (leads, actor) => {
  if (!Array.isArray(leads) || leads.length === 0) return listLeads();

  await kv.update(DELETED_KEY, {}, (current) => {
    const tombstones = { ...(current && typeof current === 'object' ? current : {}) };
    for (const lead of leads) {
      if (!lead || typeof lead !== 'object') continue;
      for (const key of tombstoneKeys(lead)) delete tombstones[key];
    }
    return tombstones;
  });

  // The tombstones are gone by now, so the normal merge puts the leads back
  return upsertLeads(leads, actor);
};

module.exports = {
  listLeads,
  claimLead,
  markReplied,
  upsertLeads,
  deleteLeads,
  restoreLeads,
  listDeleted,
  configured: () => kv.configured()
};
