// The browser keeps its own copy of the outreach history for offline work; this folds the
// server's copy in.
// One event is one row: a send that appears both in this browser's copy and in the server's
// copy is the same event, even though only the server's copy knows which employee made it.
// Channel, lead, subject and the minute identify it.
const eventKey = (entry) =>
  [
    String(entry.channel || '').toLowerCase(),
    String(entry.leadName || entry.company || '').toLowerCase(),
    String(entry.notes || entry.subject || '').toLowerCase(),
    String(entry.timestamp || entry.recordedAt || '').slice(0, 16)
  ].join('|');

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
