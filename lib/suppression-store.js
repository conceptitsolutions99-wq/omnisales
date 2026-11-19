// Everyone who asked us to stop, and every address a mailbox provider rejected outright.
// The send path reads this before each message, so a promise made in a signature is kept even
// when nobody read the shared inbox.
const kv = require('./kv-store');

const KEY = 'omnisales:suppressions';

const normalise = (email) => String(email || '').trim().toLowerCase();

const listAll = async () => {
  try {
    const rows = await kv.read(KEY, {});
    return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
  } catch (err) {
    console.error('Could not read the suppression list:', err.message);
    return {};
  }
};

const listSuppressed = async () => {
  const all = await listAll();
  return Object.entries(all)
    .map(([email, info]) => ({ email, ...(info || {}) }))
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
};

// Returns the stored entry when the address may not be written to, otherwise null
const findSuppressed = async (email) => {
  const key = normalise(email);
  if (!key) return null;
  const all = await listAll();
  return all[key] ? { email: key, ...all[key] } : null;
};

// The first reason wins: an opt-out must never be overwritten by a later bounce note
const suppress = async (email, { reason = 'unsubscribed', source = 'link', note = '' } = {}) => {
  const key = normalise(email);
  if (!key) return null;

  const all = await listAll();
  if (all[key]) return { email: key, ...all[key] };

  all[key] = { reason, source, at: new Date().toISOString(), note };
  await kv.write(KEY, all);
  console.log(JSON.stringify({ at: new Date().toISOString(), event: 'suppressed', email: key, reason, source }));
  return { email: key, ...all[key] };
};

// An admin can put an address back on the list after a mistaken opt-out is cleared up
const release = async (email) => {
  const key = normalise(email);
  if (!key) return false;

  const all = await listAll();
  if (!all[key]) return false;

  delete all[key];
  await kv.write(KEY, all);
  return true;
};

module.exports = {
  normalise,
  listSuppressed,
  findSuppressed,
  suppress,
  release,
  configured: () => kv.configured()
};
