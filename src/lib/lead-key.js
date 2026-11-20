// Client-side identity and merging for the shared lead list. The same key rule runs on the
// server (lib/leads-store.js): a lead is one business, whichever provider found it.

export const statusRank = (status) =>
  ({ New: 0, Contacted: 1, Replied: 2, Considering: 2, Qualified: 3, 'Deal Completed': 4, Denied: 4 }[status] ?? 1);

export const leadKey = (lead) => {
  const digits = String(lead?.phone || '').replace(/\D/g, '');
  if (digits.length >= 7) return `phone:${digits.slice(-10)}`;
  const email = String(lead?.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  return `id:${String(lead?.id || '').trim()}`;
};

const fillBlankFields = (target, source) => {
  const merged = { ...target };
  for (const [field, value] of Object.entries(source)) {
    const blank = merged[field] === undefined || merged[field] === null || merged[field] === '';
    if (blank && value !== undefined && value !== null && value !== '') merged[field] = value;
  }
  return merged;
};

const latest = (a, b) => [a, b].filter(Boolean).sort().pop();

// The two lists are folded together without losing a status or the employee behind it: the
// further-along status wins, and a newer contact replaces an older one.
export const mergeLeadLists = (local, remote) => {
  const byKey = new Map();
  for (const lead of local || []) byKey.set(leadKey(lead), lead);

  for (const lead of remote || []) {
    const key = leadKey(lead);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, lead);
      continue;
    }

    const localAhead = statusRank(existing.status) > statusRank(lead.status);
    const stronger = localAhead ? existing : lead;
    const weaker = localAhead ? lead : existing;
    const localNewerContact = (existing.contactedAt || '') >= (lead.contactedAt || '');

    byKey.set(key, {
      // Blank details are filled from whichever side has them, then the decided values are
      // written on top: a blank-fill alone would keep the weaker status because "New" is not blank
      ...fillBlankFields(weaker, stronger),
      status: stronger.status || weaker.status,
      statusBy: stronger.statusBy || weaker.statusBy || '',
      statusByEmail: stronger.statusByEmail || weaker.statusByEmail || '',
      statusAt: latest(existing.statusAt, lead.statusAt),
      contactedAt: latest(existing.contactedAt, lead.contactedAt),
      contactedBy: localNewerContact ? existing.contactedBy : lead.contactedBy,
      updatedAt: latest(existing.updatedAt, lead.updatedAt)
    });
  }

  return [...byKey.values()];
};
