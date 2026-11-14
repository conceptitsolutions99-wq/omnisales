// The session lives in an HttpOnly cookie set by the server; the browser never sees a password.

export async function getSession() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (response.status === 401) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Session check failed (${response.status}).`);
  return data.user || null;
}

export async function signIn(email, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Sign-in failed (${response.status}).`);
  return data.user;
}

export async function signOut() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (err) {
    /* the UI still signs out locally */
  }
}
