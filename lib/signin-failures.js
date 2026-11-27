// Consecutive wrong passwords for one account. The count lives in the shared key/value table so
// it survives cold starts and spans serverless instances; it is keyed by account address and
// never stores a password.
const kv = require('./kv-store');

const KEY = 'omnisales:signin-failures';

const positiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// "Several" is three by default: a typo or two is normal, a run is not
const THRESHOLD = positiveInt(process.env.SIGNIN_FAILURE_ALERT_THRESHOLD, 3);
const WINDOW_MS = positiveInt(process.env.SIGNIN_FAILURE_WINDOW_MINUTES, 60) * 60 * 1000;

// Records one wrong password and says whether this attempt crossed the threshold. Once a streak
// has been reported it stays quiet, so an attack does not flood the admin; a successful sign-in
// clears the entry. A gap longer than the window starts a new streak.
const recordFailure = async (email, { ip = '', at = Date.now() } = {}) => {
  const address = String(email || '').trim().toLowerCase();
  if (!address) return { count: 0, shouldAlert: false };

  try {
    // Under the row lock: attempts arriving together are counted together, or a password run
    // stays under the alert threshold and nobody is told
    let result = { count: 0, shouldAlert: false };

    await kv.update(KEY, {}, (current) => {
      const all = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
      const previous = all[address];
      const continued =
        previous && Number.isFinite(previous.lastAt) && at - previous.lastAt <= WINDOW_MS;

      const count = continued ? Math.min(1000, Number(previous.count || 0) + 1) : 1;
      const shouldAlert = count >= THRESHOLD && !(continued && previous.alerted);

      all[address] = {
        count,
        lastAt: at,
        alerted: Boolean(continued && previous.alerted) || shouldAlert
      };
      result = { count, shouldAlert, lastAt: at, ip: String(ip || '').replace(/[\r\n]+/g, ' ').trim() };
      return all;
    });

    return result;
  } catch (err) {
    // Alerting must never change the sign-in result
    console.error('Could not record a failed sign-in:', err.message);
    return { count: 0, shouldAlert: false };
  }
};

const clearFailures = async (email) => {
  const address = String(email || '').trim().toLowerCase();
  if (!address) return false;

  try {
    let cleared = false;
    await kv.update(KEY, {}, (current) => {
      const all = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
      if (!all[address]) return null;
      delete all[address];
      cleared = true;
      return all;
    });
    return cleared;
  } catch (err) {
    console.error('Could not clear failed sign-in counts:', err.message);
    return false;
  }
};

module.exports = { recordFailure, clearFailures };
