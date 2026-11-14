// Staff accounts are created and reset on the server; the temporary password comes back once.
const request = async (options) => {
  const response = await fetch('/api/admin/users', {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
};

export const listStaff = () => request({ method: 'GET' });

export const createStaff = (payload) => request({ method: 'POST', body: JSON.stringify(payload) });

export const resetStaffPassword = (email) =>
  request({ method: 'PATCH', body: JSON.stringify({ email, action: 'reset-password' }) });

export const setStaffStatus = (email, status) =>
  request({ method: 'PATCH', body: JSON.stringify({ email, action: 'set-status', status }) });

export const updateStaff = (email, patch) =>
  request({ method: 'PATCH', body: JSON.stringify({ email, action: 'update', ...patch }) });
