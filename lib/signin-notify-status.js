// Whether the last sign-in note actually went out. A wrong recipient or a revoked Gmail app
// password only ever reached the server log, which nobody reads, so the outcome is kept in the
// shared key/value table where the admin dashboard can show it. Only the address and the error
// text are stored - never a password.
const kv = require('./kv-store');

const KEY = 'omnisales:signin-note-status';
const MAX_ERROR = 200;

const clean = (value, limit) =>
  String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, limit);

const read = async () => {
  try {
    const row = await kv.read(KEY, null);
    return row && typeof row === 'object' && !Array.isArray(row) ? row : null;
  } catch (err) {
    console.error('Could not read the last sign-in note status:', err.message);
    return null;
  }
};

// Recording is best effort: a store problem must not turn a successful send into a failed login
const record = async ({ sent, reason, to, error }) => {
  const entry = {
    at: new Date().toISOString(),
    sent: Boolean(sent),
    reason: clean(reason, 40) || (sent ? 'sent' : 'unknown'),
    to: clean(to, 160),
    error: error ? clean(error, MAX_ERROR) : null
  };

  try {
    await kv.write(KEY, entry);
  } catch (err) {
    console.error('Could not record the last sign-in note status:', err.message);
  }
  return entry;
};

module.exports = { read, record };
