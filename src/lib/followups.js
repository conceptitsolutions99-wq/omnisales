// Client side of the shared follow-up queue. It lives on /api/activity under ?followups=1
// because a deployment on this plan may only contain twelve serverless functions.
const parse = async (pending) => {
  const response = await pending;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Follow-up sync failed (${response.status}).`);
  return Array.isArray(data.followups) ? data.followups : [];
};

export const listFollowups = async () =>
  parse(fetch('/api/activity?followups=1', { credentials: 'same-origin' }));

export const pushFollowups = async (followups) =>
  parse(
    fetch('/api/activity?followups=1', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followups })
    })
  );
