// Repeated wrong passwords for one account are worth telling the admin about. The count lives
// in the shared key/value table so it does not reset between serverless instances, and it is
// keyed by the account address, never by a display name. No password is ever stored here.
const kv = require('./kv-store');

const KEY = 'omnisales:signin-failures';
const LIMIT = 500;

const positiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// "Several" is three by default: a typo or two is normal, a run is not
const THRESHOLD = positiveInt(process.env.SIGNIN_FAILURE_ALERT_THRESHOLD, 3);
const WINDOW_MS = positiveInt(process.env.SIGNIN_FAILURE_WINDOW_MINUTES, 60) * 60 * 1000;

const normalise = (email) => String(email || '').trim().toLowerCase();
const oneLine = (value) => String(value || '').replace(/[\r\n]+/g, ' ').trim();

const readAll = async () => {
  try {
    const rows = await kv.read(KEY, {});
    return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
  } catch (err) {
    console.error('Could not read failed sign-in counts:', err.message);
    return {};
  }
};

// Records one wrong password and says whether this attempt crossed the alert threshold. Once
// an alert has gone out the rest of the streak stays quiet, so a long attack does not flood the
// admin; a successful sign-in clears the streak and the next run can alert again.
const recordFailure = async (email, { ip = '', at = Date.now() } = {}) => {
  const address = normalise(email);
  if (!address) return { count: 0, shouldAlert: false, threshold: THRESHOLD };

  try {
    const all = await readAll();
    const previous = all[address];
    const fresh =
      !previous ||
      !Number.isFinite(previous.lastAt) ||
      at - previous.lastAt > WINDOW_MS ||
      at < previous.lastAt - WINDOW_MS;

    const base = fresh
      ? { count: 0, firstAt: at, alerted: false, alertedAt: null }
      : previous;
    const count = Math.min(1000, Number(base.count || 0) + 1);
    const shouldAlert = count >= THRESHOLD && !base.alerted;

    all[address] = {
      count,
      firstAt: base.firstAt || at,
      lastAt: at,
      ip: oneLine(ip) || oneLine(base.ip) || '',
      alerted: Boolean(base.alerted || shouldAlert),
      alertedAt: shouldAlert ? at : base.alertedAt || null
    };

    // Keep the map bounded: only accounts with recent runs are useful
    const entries = Object.entries(all);
    const trimmed =
      entries.length > LIMIT
        ? Object.fromEntries(entries.sort((a, b) => (b[1].lastAt || 0) - (a[1].lastAt || 0)).slice(0, LIMIT))
        : all;

    await kv.write(KEY, trimmed);
    return {
      count,
      firstAt: all[address].firstAt,
      lastAt: at,
      ip: oneLine(ip),
      shouldAlert,
      threshold: THRESHOLD
    };
  } catch (err) {
    // Alerting must never change the sign-in result
    console.error('Could not record a failed sign-in:', err.message);
    return { count: 0, shouldAlert: false, threshold: THRESHOLD };
  }
};

const clearFailures = async (email) => {
  const address = normalise(email);
  if (!address) return false;

  try {
    const all = await readAll();
    if (!all[address]) return false;
    delete all[address];
    await kv.write(KEY, all);
    return true;
  } catch (err) {
    console.error('Could not clear failed sign-in counts:', err.message);
    return false;
  }
};

module.exports = {
  recordFailure,
  clearFailures,
  threshold: THRESHOLD,
  windowMinutes: WINDOW_MS / 60000
};
