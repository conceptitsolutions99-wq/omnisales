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

export async function fetchReplies(currentUser) {
  const params = new URLSearchParams();
  if (currentUser?.name) params.set('agent', currentUser.name);
  if (isAdminUser(currentUser)) params.set('all', '1');

  const response = await fetch(`/api/replies?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Could not load replies (${response.status}).`);

  const replies = Array.isArray(data.replies) ? data.replies : [];
  const seen = readSeen();

  return replies.map((reply) => ({ ...reply, unread: !seen.has(reply.id) }));
}
