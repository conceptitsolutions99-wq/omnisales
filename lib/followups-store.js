// Follow-up tasks are the team's, not one browser's: a callback or transfer scheduled on a
// laptop has to be visible, cancellable and completable from any device. They live in the same
// shared key/value table as leads and activity, with a memory fallback for local work.
const kv = require('./kv-store');

const KEY = 'omnisales:followups';
const LIMIT = 1000;

const listAll = async () => {
  try {
    const rows = await kv.read(KEY, []);
    return Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
  } catch (err) {
    console.error('Could not read follow-ups:', err.message);
    return [];
  }
};

const listFollowups = async () =>
  listAll().then((rows) =>
    rows.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
  );

// A task is written by the browser that changed it, but the credit is always the session's:
// a client cannot create work in a colleague's name. The merge runs under the row lock, so two
// devices scheduling work at the same moment cannot each write a queue built before the other.
const upsertFollowups = async (tasks, actor = {}) => {
  if (!Array.isArray(tasks) || tasks.length === 0) return listAll();

  const now = new Date().toISOString();

  return kv.update(KEY, [], (current) => {
  const existing = Array.isArray(current) ? current : [];
  const byId = new Map(existing.map((task) => [String(task.id), task]));

  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue;
    const rawId = task.id;
    if (rawId === undefined || rawId === null || String(rawId).trim() === '') continue;

    const id = String(rawId);
    const previous = byId.get(id);

    // A prospect's reply cancels the task for everyone. A delayed push from a device that still
    // has the old card open must not put it back into the queue.
    const cancelledByReply =
      previous?.status === 'Cancelled' && previous.cancelledReason === 'Prospect replied';
    const statusFields =
      cancelledByReply && task.status !== 'Cancelled'
        ? { status: previous.status, cancelledAt: previous.cancelledAt, cancelledReason: previous.cancelledReason }
        : {};

    byId.set(id, {
      ...(previous || {}),
      ...task,
      ...statusFields,
      id: previous?.id ?? task.id,
      createdAt: previous?.createdAt || task.createdAt || now,
      createdBy: previous?.createdBy || task.createdBy || actor.name || '',
      createdByEmail: previous?.createdByEmail || task.createdByEmail || actor.email || '',
      updatedAt: now,
      updatedBy: actor.name || '',
      updatedByEmail: String(actor.email || '').toLowerCase()
    });
  }

  return [...byId.values()]
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, LIMIT);
  });
};

// Called when a reply is matched to our outreach: every pending task for those leads is closed
// in the shared store, so the cancellation appears on every device rather than only in the
// browser that happened to notice the reply.
const cancelForRepliedLeads = async (leads) => {
  const leadIds = new Set(
    (Array.isArray(leads) ? leads : []).map((lead) => String(lead?.id ?? '')).filter(Boolean)
  );
  if (leadIds.size === 0) return { changed: 0, tasks: [] };

  const now = new Date().toISOString();
  const changed = [];

  // The cancellation is read and written under the lock, so a task scheduled while the reply is
  // being processed cannot be dropped by a queue built before it existed
  await kv.update(KEY, [], (current) => {
    const all = Array.isArray(current) ? current : [];
    const next = all.map((task) => {
      if (!task || task.status === 'Completed' || task.status === 'Cancelled') return task;
      if (!leadIds.has(String(task.leadId))) return task;
      const cancelled = {
        ...task,
        status: 'Cancelled',
        cancelledAt: now,
        cancelledReason: 'Prospect replied',
        updatedAt: now,
        updatedBy: 'system',
        updatedByEmail: ''
      };
      changed.push(cancelled);
      return cancelled;
    });

    return changed.length > 0 ? next : null;
  });

  return { changed: changed.length, tasks: changed };
};

// Admin reset: the queue is the team's, so clearing it removes every task for every device
const clearFollowups = async () => {
  await kv.update(KEY, [], () => []);
  return [];
};

module.exports = { listFollowups, upsertFollowups, cancelForRepliedLeads, clearFollowups };
