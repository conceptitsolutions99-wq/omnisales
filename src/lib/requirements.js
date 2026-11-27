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

// A link to paste into WhatsApp or a hand-written email. Each call creates its own form record,
// so only the forms the agent actually shares show up as awaiting answers.
export const createRequirementLink = (type, lead = {}) =>
  json(
    fetch('/api/requirements', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'link',
        type,
        leadId: lead.id ?? null,
        leadEmail: lead.email || '',
        leadName: lead.name || '',
        company: lead.company || ''
      })
    })
  ).then((data) => ({ ...data.link, reused: Boolean(data.reused) }));

// The forms this lead already has, one per type. The dialler shows these links instead of
// creating a second form for the same project.
export const listRequirementLinksForLead = (lead = {}) => {
  const params = new URLSearchParams();
  if (lead.id !== null && lead.id !== undefined && String(lead.id) !== '') params.set('leadId', String(lead.id));
  if (lead.email) params.set('leadEmail', String(lead.email));
  return json(
    fetch(`/api/requirements?${params.toString()}`, { credentials: 'same-origin' })
  ).then((data) => data.links || []);
};

// Admin only: the server refuses this for anyone else
export const deleteRequirementForms = (tokens) =>
  json(
    fetch('/api/requirements', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens })
    })
  );

export const requirementLink = (token) => `${window.location.origin}/#/requirements/${token}`;

// Which answered forms this browser has already opened, so the badge means "answers that
// arrived" rather than "every form ever answered"
const ANSWERS_SEEN_KEY = 'cit_seen_requirement_answers';

export const readSeenRequirementAnswers = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(ANSWERS_SEEN_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    return new Set();
  }
};

export const markRequirementAnswersSeen = (tokens) => {
  try {
    const seen = readSeenRequirementAnswers();
    tokens.forEach((token) => seen.add(token));
    localStorage.setItem(ANSWERS_SEEN_KEY, JSON.stringify([...seen].slice(-500)));
  } catch (err) {
    /* storage unavailable: the badge simply reappears next session */
  }
};
