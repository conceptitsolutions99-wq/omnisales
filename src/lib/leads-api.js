// Client side of the shared lead list. Every request carries the session cookie, so the server
// knows which employee is making the change.
const parse = async (pending) => {
  const response = await pending;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Lead sync failed (${response.status}).`);
  return {
    leads: Array.isArray(data.leads) ? data.leads : [],
    // Keys of leads an admin deleted: every browser drops its copy instead of pushing it back
    deleted: Array.isArray(data.deleted) ? data.deleted : []
  };
};

export const listSharedLeads = async () => parse(fetch('/api/leads', { credentials: 'same-origin' }));

const parseActivity = async (pending) => {
  const response = await pending;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Activity sync failed (${response.status}).`);
  return {
    activity: Array.isArray(data.activity) ? data.activity : [],
    // Keys an admin deleted: every browser drops its cached copy instead of pushing it back
    deleted: Array.isArray(data.deleted) ? data.deleted : []
  };
};

// An admin receives the whole team's history; an employee receives only their own
export const listActivity = async () => parseActivity(fetch('/api/activity', { credentials: 'same-origin' }));

// Admin only on the server: clears the shared history for every device
export const clearSharedActivity = async () =>
  parseActivity(fetch('/api/activity', { method: 'DELETE', credentials: 'same-origin' }));

// Admin only on the server: removes the entries the admin selected, for the whole team. An entry is
// named by its key and its id, so an older row without an id can still be deleted.
export const deleteSharedActivity = async ({ keys = [], ids = [] } = {}) =>
  parseActivity(
    fetch('/api/activity', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys, ids })
    })
  );

export const pushActivity = async (activity) =>
  parseActivity(
    fetch('/api/activity', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity })
    })
  );

export const pushSharedLeads = async (leads) =>
  parse(
    fetch('/api/leads', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads })
    })
  );

// Admin only on the server: undo of a delete, so the leads come back for the whole team
export const restoreSharedLeads = async (leads) =>
  parse(
    fetch('/api/leads', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads })
    })
  );

// Admin only on the server: the leads are removed for the whole team
export const deleteSharedLeads = async (leads) =>
  parse(
    fetch('/api/leads', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads })
    })
  );
