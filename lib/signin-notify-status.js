// Whether the admin notes actually went out. A wrong recipient or a revoked Gmail app password
// used to reach nothing but the server log, which nobody reads, so the outcome is kept in the
// shared key/value table where the admin dashboard can show it. Only the address and the error
// text are stored - never a password.
//
// Each kind of note fails on its own: a delivered staff sign-in note says nothing about the
// throttle alert, which may be refused for the same mailbox at a different moment. One row holds
// the latest outcome of every kind so the checklist can show them separately.
const kv = require('./kv-store');

const KEY = 'omnisales:signin-note-status';
const MAX_ERROR = 200;
const TYPES = ['signin', 'failed', 'throttle', 'suspended'];

const clean = (value, limit) =>
  String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, limit);

const isEntry = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && 'sent' in value;

// Records written before the per-kind map hold the staff sign-in note alone, so an older row is
// read as exactly that instead of being thrown away.
const normalize = (stored) => {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  if (isEntry(stored)) return { signin: stored };
  const types = {};
  for (const type of TYPES) if (isEntry(stored[type])) types[type] = stored[type];
  return types;
};

const readAll = async () => {
  try {
    return normalize(await kv.read(KEY, {}));
  } catch (err) {
    console.error('Could not read the last admin note statuses:', err.message);
    return {};
  }
};

const read = async (type = 'signin') => (await readAll())[type] || null;

// Recording is best effort: a store problem must not turn a successful send into a failed login
const record = async ({ type = 'signin', sent, reason, to, error }) => {
  const kind = TYPES.includes(type) ? type : 'signin';
  const entry = {
    at: new Date().toISOString(),
    sent: Boolean(sent),
    reason: clean(reason, 40) || (sent ? 'sent' : 'unknown'),
    to: clean(to, 160),
    error: error ? clean(error, MAX_ERROR) : null
  };

  try {
    // The other kinds' outcomes are read and written back in the same row lock, so recording one
    // alert cannot erase what the last sign-in note did.
    await kv.update(KEY, {}, (current) => ({ ...normalize(current), [kind]: entry }));
  } catch (err) {
    console.error('Could not record the last admin note status:', err.message);
  }
  return entry;
};

module.exports = { TYPES, read, readAll, record };
