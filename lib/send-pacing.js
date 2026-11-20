// The whole team sends through one mailbox, so its reputation is shared: a pasted list of
// hundreds can get the account throttled or filtered for everyone. Three limits apply to every
// outreach message — today's ceiling, a warm-up ramp that raises that ceiling over time, and a
// minimum gap between sends — kept in the shared store so a cold start cannot reset them.
//
// A slot is reserved before sending and released if SMTP fails, so a configuration error does
// not spend the team's allowance. The read/write pair is not atomic; two simultaneous sends
// could both pass the check at the boundary, which is acceptable for a small team and still
// prevents the pasted-list case this exists for.
const kv = require('./kv-store');
const emailLogStore = require('./email-log-store');

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

// A mailbox that has just started sending should not jump straight to 60 messages a day. When
// OUTREACH_WARMUP_START is set, the ceiling begins at START_LIMIT and grows by DAILY_STEP each
// calendar day until it reaches DAILY_LIMIT. Leaving it unset means the mailbox is already warm.
const WARMUP_START = (() => {
  const raw = String(process.env.OUTREACH_WARMUP_START || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
})();
const WARMUP_START_LIMIT = positiveInt(process.env.OUTREACH_WARMUP_START_LIMIT, 10);
const WARMUP_DAILY_STEP = positiveInt(process.env.OUTREACH_WARMUP_DAILY_STEP, 5);

// "Today" is a UTC calendar day, so the readout and the reset are predictable for every agent
// whatever their own time zone is
const utcDayStart = (value) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const warmupFor = (now) => {
  if (WARMUP_START === null) return null;
  const dayIndex = Math.max(0, Math.floor((utcDayStart(now) - utcDayStart(WARMUP_START)) / DAY_MS));
  const limit = Math.min(DAILY_LIMIT, WARMUP_START_LIMIT + dayIndex * WARMUP_DAILY_STEP);
  return {
    active: limit < DAILY_LIMIT,
    day: dayIndex + 1,
    startLimit: WARMUP_START_LIMIT,
    step: WARMUP_DAILY_STEP,
    start: new Date(WARMUP_START).toISOString().slice(0, 10),
    limit
  };
};

// The store keeps a day of history so the spacing check still sees the last send around
// midnight; only today's entries count against the daily ceiling
const recentStamps = async (now) => {
  const rows = await kv.read(KEY, []);
  const stamps = Array.isArray(rows) ? rows.filter((value) => Number.isFinite(value)) : [];
  return stamps.filter((at) => at > now - DAY_MS).sort((a, b) => a - b);
};

// A mailbox that was already sending before this limiter existed would otherwise start the day
// at zero and get extra headroom. The delivery log is the record of what actually left, so it
// seeds the window: real sends only, no deliverability tests, no failed attempts.
const loggedSends = async (now) => {
  const rows = await emailLogStore.list(300);
  return rows
    .filter((row) => row && row.test !== true && row.status === 'sent')
    .map((row) => Date.parse(row.sentAt))
    .filter((at) => Number.isFinite(at) && at > now - DAY_MS)
    .sort((a, b) => a - b);
};

const summarise = (stamps, now, logged = []) => {
  const warmup = warmupFor(now);
  const limit = warmup ? warmup.limit : DAILY_LIMIT;
  const dayStart = utcDayStart(now);
  // A send appears both as a reserved slot and as a log row once SMTP accepts it. Taking the
  // larger of the two counts that one send once, while still counting sends made before the
  // limiter recorded slots and reservations whose log row has not been written yet.
  const used = Math.max(
    stamps.filter((at) => at >= dayStart).length,
    logged.filter((at) => at >= dayStart).length
  );
  const lastStamp = stamps.length ? stamps[stamps.length - 1] : 0;
  const lastLogged = logged.length ? logged[logged.length - 1] : 0;
  const last = Math.max(lastStamp, lastLogged);
  const waitMs = last ? Math.max(0, last + MIN_GAP_SECONDS * 1000 - now) : 0;
  return {
    limit,
    dailyLimit: DAILY_LIMIT,
    used,
    remaining: Math.max(0, limit - used),
    minGapSeconds: MIN_GAP_SECONDS,
    retryAfterSeconds: Math.ceil(waitMs / 1000),
    nextAllowedAt: last ? new Date(last + MIN_GAP_SECONDS * 1000).toISOString() : new Date(now).toISOString(),
    resetsAt: new Date(dayStart + DAY_MS).toISOString(),
    window: 'day',
    warmup
  };
};

const unavailable = () => ({
  limit: DAILY_LIMIT,
  dailyLimit: DAILY_LIMIT,
  used: 0,
  remaining: 0,
  minGapSeconds: MIN_GAP_SECONDS,
  retryAfterSeconds: 0,
  nextAllowedAt: null,
  resetsAt: null,
  window: 'day',
  warmup: null,
  unavailable: true
});

// What the compose card shows and what a refused send explains
const status = async () => {
  try {
    const now = Date.now();
    const [stamps, logged] = await Promise.all([recentStamps(now), loggedSends(now)]);
    return summarise(stamps, now, logged);
  } catch (err) {
    console.error('Could not read the send allowance:', err.message);
    return unavailable();
  }
};

const reserve = async () => {
  const now = Date.now();
  let stamps = [];
  let logged = [];
  try {
    [stamps, logged] = await Promise.all([recentStamps(now), loggedSends(now)]);
  } catch (err) {
    // The limiter cannot vouch for the mailbox, so sending pauses rather than running blind
    console.error('Could not reserve a send slot:', err.message);
    return { ok: false, reason: 'unavailable', ...unavailable() };
  }

  const state = summarise(stamps, now, logged);
  if (state.remaining <= 0) {
    const resetsAt = new Date(state.resetsAt).getTime();
    return {
      ok: false,
      reason: 'daily',
      ...state,
      retryAfterSeconds: Math.max(1, Math.ceil((resetsAt - now) / 1000)),
      nextAllowedAt: state.resetsAt
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
  return { ok: true, stamp: now, ...summarise(next, now, logged) };
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
    const warm = state.warmup?.active
      ? ` The mailbox is on warm-up day ${state.warmup.day}, so the ceiling rises tomorrow.`
      : '';
    return `Daily send limit reached: ${state.used} of ${state.limit} sends used today.${warm} The allowance resets at ${new Date(state.resetsAt).toUTCString()}.`;
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
  limits: {
    daily: DAILY_LIMIT,
    minGapSeconds: MIN_GAP_SECONDS,
    warmupStart: WARMUP_START ? new Date(WARMUP_START).toISOString() : null,
    warmupStartLimit: WARMUP_START_LIMIT,
    warmupDailyStep: WARMUP_DAILY_STEP
  }
};
