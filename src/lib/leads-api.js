// Client side of the shared lead list. Every request carries the session cookie, so the server
// knows which employee is making the change.
const parse = async (pending) => {
  const response = await pending;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Lead sync failed (${response.status}).`);
  return Array.isArray(data.leads) ? data.leads : [];
};

export const listSharedLeads = async () => parse(fetch('/api/leads', { credentials: 'same-origin' }));

const parseActivity = async (pending) => {
  const response = await pending;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Activity sync failed (${response.status}).`);
  return Array.isArray(data.activity) ? data.activity : [];
};

// An admin receives the whole team's history; an employee receives only their own
export const listActivity = async () => parseActivity(fetch('/api/activity', { credentials: 'same-origin' }));

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
