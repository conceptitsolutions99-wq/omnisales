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

  // Under the row lock: an opt-out recorded while another address is being added must not be
  // written over, or the send path would happily mail someone who asked us to stop
  let stored = null;
  let created = false;

  await kv.update(KEY, {}, (current) => {
    const all = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    if (all[key]) {
      stored = { email: key, ...all[key] };
      return null;
    }

    all[key] = { reason, source, at: new Date().toISOString(), note };
    stored = { email: key, ...all[key] };
    created = true;
    return all;
  });

  if (created) {
    console.log(JSON.stringify({ at: new Date().toISOString(), event: 'suppressed', email: key, reason, source }));
  }
  return stored;
};

// An admin can put an address back on the list after a mistaken opt-out is cleared up
const release = async (email) => {
  const key = normalise(email);
  if (!key) return false;

  let removed = false;
  await kv.update(KEY, {}, (current) => {
    const all = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    if (!all[key]) return null;
    delete all[key];
    removed = true;
    return all;
  });
  return removed;
};

module.exports = {
  normalise,
  listSuppressed,
  findSuppressed,
  suppress,
  release,
  configured: () => kv.configured()
};
