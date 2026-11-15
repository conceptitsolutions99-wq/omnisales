// Client side of the shared lead list. Every request carries the session cookie, so the server
// knows which employee is making the change.
const parse = async (pending) => {
  const response = await pending;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Lead sync failed (${response.status}).`);
  return Array.isArray(data.leads) ? data.leads : [];
};

export const listSharedLeads = async () => parse(fetch('/api/leads', { credentials: 'same-origin' }));

export const pushSharedLeads = async (leads) =>
  parse(
    fetch('/api/leads', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads })
    })
  );
