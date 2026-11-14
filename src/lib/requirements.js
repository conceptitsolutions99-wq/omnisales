// Requirements forms: the customer's page reads and submits by token, staff read the list.
const json = async (pending) => {
  const response = await pending;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
};

export const loadRequirementForm = (token) =>
  json(fetch(`/api/requirements?token=${encodeURIComponent(token)}`, { credentials: 'same-origin' }));

export const submitRequirementForm = (token, payload) =>
  json(
    fetch('/api/requirements', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...payload })
    })
  );

export const listRequirements = () => json(fetch('/api/requirements', { credentials: 'same-origin' }));

export const requirementLink = (token) => `${window.location.origin}/#/requirements/${token}`;
