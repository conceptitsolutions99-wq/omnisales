// Customer replies to outreach email, read from the shared inbox by /api/replies.
const SEEN_KEY = 'cit_seen_replies';

const readSeen = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    return new Set();
  }
};

export const markRepliesSeen = (ids) => {
  try {
    const seen = readSeen();
    ids.forEach((id) => seen.add(id));
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-500)));
  } catch (err) {
    /* storage unavailable: the badge simply reappears next session */
  }
};

export const isAdminUser = (user) =>
  Boolean(user) && (user.role === 'Admin' || Boolean(user.permissions?.admin));

// Admin and analyst read every employee's replies and forms; an agent reads only their own
export const isReviewerUser = (user) =>
  isAdminUser(user) || user?.role === 'Analyst' || Boolean(user?.permissions?.analytics);

export async function fetchReplies(currentUser) {
  const params = new URLSearchParams();
  if (currentUser?.name) params.set('agent', currentUser.name);
  if (isReviewerUser(currentUser)) params.set('all', '1');

  const response = await fetch(`/api/replies?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Could not load replies (${response.status}).`);

  const replies = Array.isArray(data.replies) ? data.replies : [];
  const seen = readSeen();

  return {
    replies: replies.map((reply) => ({ ...reply, unread: !seen.has(reply.id) })),
    // Leads the server moved to Replied because of these replies, so the list updates at once
    leads: Array.isArray(data.leads) ? data.leads : [],
    storage: data.storage === 'memory' ? 'memory' : 'persistent'
  };
}

// Admins hand a reply to a specific employee; an empty email returns it to automatic attribution
export async function assignReply(replyId, email) {
  const response = await fetch('/api/replies', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: replyId, email: email || '' })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Could not assign the reply (${response.status}).`);
  return data;
}
