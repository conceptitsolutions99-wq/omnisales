// A history row belongs to the account that recorded it. The address is stable across a rename;
// older rows carry only the display name, which stays as the fallback.
export const isOwnActivity = (entry, user) => {
  if (!entry || !user) return false;
  const owner = String(entry.callerEmail || '').trim().toLowerCase();
  const viewer = String(user.email || '').trim().toLowerCase();
  if (owner) return Boolean(viewer) && owner === viewer;
  return String(entry.caller || '') === String(user.name || '');
};
