// The whole team sends through one mailbox, so its reputation is shared: a pasted list of
// hundreds can get the account throttled or filtered for everyone. Two limits apply to every
// outreach message — a rolling 24-hour ceiling and a minimum gap between sends — and they are
// kept in the same shared store as the rest of the team state so a cold start cannot reset them.
//
// A slot is reserved before sending and released if SMTP fails, so a configuration error does
// not spend the team's allowance. The read/write pair is not atomic; two simultaneous sends
// could both pass the check at the boundary, which is acceptable for a small team and still
// prevents the pasted-list case this exists for.
const kv = require('./kv-store');

const KEY = 'omnisales:send-pacing';
const DAY_MS = 24 * 60 * 60 * 1000;

const positiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// Conservative defaults for a single Gmail mailbox: 60 outreach messages a day, at least 30
// seconds apart. Both can be raised once the domain has its own sending reputation.
const DAILY_LIMIT = positiveInt(process.env.OUTREACH_DAILY_LIMIT, 60);
const MIN_GAP_SECONDS = positiveInt(process.env.OUTREACH_MIN_GAP_SECONDS, 30);

const recentStamps = async (now) => {
  const rows = await kv.read(KEY, []);
  const stamps = Array.isArray(rows) ? rows.filter((value) => Number.isFinite(value)) : [];
  return stamps.filter((at) => at > now - DAY_MS).sort((a, b) => a - b);
};

const summarise = (stamps, now) => {
  const used = stamps.length;
  const last = used ? stamps[used - 1] : 0;
  const waitMs = last ? Math.max(0, last + MIN_GAP_SECONDS * 1000 - now) : 0;
  return {
    limit: DAILY_LIMIT,
    used,
    remaining: Math.max(0, DAILY_LIMIT - used),
    minGapSeconds: MIN_GAP_SECONDS,
    retryAfterSeconds: Math.ceil(waitMs / 1000),
    nextAllowedAt: last ? new Date(last + MIN_GAP_SECONDS * 1000).toISOString() : new Date(now).toISOString()
  };
};

const unavailable = () => ({
  limit: DAILY_LIMIT,
  used: 0,
  remaining: 0,
  minGapSeconds: MIN_GAP_SECONDS,
  retryAfterSeconds: 0,
  nextAllowedAt: null,
  unavailable: true
});

// What the compose card shows and what a refused send explains
const status = async () => {
  try {
    return summarise(await recentStamps(Date.now()), Date.now());
  } catch (err) {
    console.error('Could not read the send allowance:', err.message);
    return unavailable();
  }
};

const reserve = async () => {
  const now = Date.now();
  let stamps = [];
  try {
    stamps = await recentStamps(now);
  } catch (err) {
    // The limiter cannot vouch for the mailbox, so sending pauses rather than running blind
    console.error('Could not reserve a send slot:', err.message);
    return { ok: false, reason: 'unavailable', ...unavailable() };
  }

  const state = summarise(stamps, now);
  if (state.remaining <= 0) {
    const oldest = stamps[0];
    const opensAt = oldest + DAY_MS;
    return {
      ok: false,
      reason: 'daily',
      ...state,
      retryAfterSeconds: Math.max(1, Math.ceil((opensAt - now) / 1000)),
      nextAllowedAt: new Date(opensAt).toISOString()
    };
  }
  if (state.retryAfterSeconds > 0) {
    return { ok: false, reason: 'spacing', ...state };
  }

  const next = [...stamps, now];
  try {
    await kv.write(KEY, next);
  } catch (err) {
    console.error('Could not record the send slot:', err.message);
    return { ok: false, reason: 'unavailable', ...unavailable() };
  }
  return { ok: true, stamp: now, ...summarise(next, now) };
};

// A message SMTP refused never reached the mailbox, so its slot goes back
const release = async (stamp) => {
  if (!Number.isFinite(stamp)) return;
  try {
    const stamps = await recentStamps(Date.now());
    await kv.write(KEY, stamps.filter((at) => at !== stamp));
  } catch (err) {
    console.error('Could not release a send slot:', err.message);
  }
};

const messageFor = (state) => {
  if (state.reason === 'daily') {
    return `Daily send limit reached: this mailbox allows up to ${state.limit} outreach ${state.limit === 1 ? 'message' : 'messages'} per 24 hours and the allowance is used up. The next slot opens at ${new Date(state.nextAllowedAt).toUTCString()}.`;
  }
  if (state.reason === 'spacing') {
    return `The mailbox sends one message every ${state.minGapSeconds} seconds to protect its reputation. Try again in ${state.retryAfterSeconds} second${state.retryAfterSeconds === 1 ? '' : 's'}.`;
  }
  return 'The send limiter is unavailable right now, so sending is paused to protect the mailbox. Try again in a minute.';
};

module.exports = {
  status,
  reserve,
  release,
  messageFor,
  limits: { daily: DAILY_LIMIT, minGapSeconds: MIN_GAP_SECONDS }
};
