// The browser keeps its own copy of the outreach history for offline work; this folds the
// server's copy in.
// A send appears twice — once in this browser's copy, once in the copy the server returned —
// and those two copies share the entry's id, so the id identifies the event. Two separate
// sends have different ids and both stay, even within the same minute.
const eventKey = (entry) => {
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

export const mergeActivity = (local, remote) => {
  const byKey = new Map();

  // The server's copy is authoritative, so it is folded in first and wins a tie
  for (const entry of [...(remote || []), ...(local || [])]) {
    if (!entry || entry.id === undefined || entry.id === null) continue;
    const key = eventKey(entry);
    if (!byKey.has(key)) byKey.set(key, entry);
  }

  return [...byKey.values()].sort((a, b) =>
    String(b.timestamp || b.recordedAt || '').localeCompare(String(a.timestamp || a.recordedAt || ''))
  );
};
