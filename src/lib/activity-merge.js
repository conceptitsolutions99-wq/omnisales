// The browser keeps its own copy of the outreach history for offline work; this folds the
// server's copy in without duplicating an entry that exists on both sides.
const entryKey = (entry) => `${String(entry.callerEmail || entry.caller || '').toLowerCase()}:${entry.id}`;

export const mergeActivity = (local, remote) => {
  const byKey = new Map();
  for (const entry of [...(remote || []), ...(local || [])]) {
    if (!entry || entry.id === undefined || entry.id === null) continue;
    const key = entryKey(entry);
    // The server's copy is authoritative for the same entry
    if (!byKey.has(key)) byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) =>
    String(b.timestamp || b.recordedAt || '').localeCompare(String(a.timestamp || a.recordedAt || ''))
  );
};
