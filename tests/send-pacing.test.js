const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const pacing = require('../lib/send-pacing');
const { summarise, refusalFor } = pacing.__test;

const LIMIT = pacing.limits.daily;
const NOW = Date.parse('2026-11-20T00:30:00.000Z');
const at = (iso) => Date.parse(iso);

test("today's readout still counts only the UTC day", () => {
  const stamps = [at('2026-11-20T00:05:00Z'), at('2026-11-20T00:10:00Z'), at('2026-11-20T00:20:00Z')];
  const state = summarise(stamps, NOW, []);

  assert.equal(state.limit, LIMIT);
  assert.equal(state.used, 3);
  assert.equal(state.remaining, LIMIT - 3);
  assert.equal(state.rollingUsed, 3);
  assert.equal(state.window, 'day');
  assert.equal(state.resetsAt, '2026-11-21T00:00:00.000Z');
});

test('the rolling window blocks a second full day right after UTC midnight', () => {
  // 60 sends between 10:00 and 19:40 yesterday: none count as "today", all are inside 24 hours
  const stamps = Array.from({ length: LIMIT }, (_, index) =>
    at('2026-11-19T10:00:00Z') + index * 10 * 60 * 1000
  );
  const state = summarise(stamps, NOW, []);

  assert.equal(state.used, 0);
  assert.equal(state.rollingUsed, LIMIT);
  assert.equal(state.rollingRemaining, 0);
  assert.equal(state.remaining, 0, 'no slot may open just because the UTC day changed');

  const refusal = refusalFor(state, NOW);
  assert.equal(refusal.ok, false);
  assert.equal(refusal.reason, 'rolling');
  // The oldest send leaves the window at 10:00 today, not at midnight
  assert.equal(refusal.nextAllowedAt, '2026-11-20T10:00:00.000Z');
  assert.equal(refusal.retryAfterSeconds, 9.5 * 60 * 60);
});

test('the rolling window leaves only the room the last 24 hours allow', () => {
  const stamps = Array.from({ length: 55 }, (_, index) =>
    at('2026-11-19T10:00:00Z') + index * 10 * 60 * 1000
  );
  const state = summarise(stamps, NOW, []);

  assert.equal(state.used, 0);
  assert.equal(state.rollingUsed, 55);
  assert.equal(state.remaining, LIMIT - 55, 'the day counter alone would wrongly allow 60');
  assert.equal(refusalFor(state, NOW), null);
});

test('a full day reports both ceilings in the refusal message', () => {
  const stamps = Array.from({ length: LIMIT }, (_, index) =>
    at('2026-11-20T00:00:00Z') + index * 1000
  );
  const state = summarise(stamps, NOW, []);
  const refusal = refusalFor(state, NOW);

  assert.equal(refusal.reason, 'daily');
  assert.equal(refusal.rollingRemaining, 0);
  assert.match(pacing.messageFor(refusal), /60 of 60 sends used today/);
  assert.match(pacing.messageFor(refusal), /rolling 24 hours/);
});

test('the rolling refusal says which window is full and when it frees', () => {
  const message = pacing.messageFor({
    reason: 'rolling',
    limit: LIMIT,
    used: 12,
    rollingUsed: LIMIT,
    rollingResetsAt: '2026-11-20T10:00:00.000Z'
  });

  assert.match(message, /Rolling 24-hour send limit reached: 60 of 60 sends in the last 24 hours/);
  assert.match(message, /Fri, 20 Nov 2026 10:00:00 GMT/);
  assert.match(message, /Today's count is 12 of 60/);
});

test('the minimum gap is unchanged', () => {
  const stamps = [NOW - 10_000];
  const state = summarise(stamps, NOW, []);
  const refusal = refusalFor(state, NOW);

  assert.equal(refusal.reason, 'spacing');
  assert.equal(refusal.retryAfterSeconds, 20);
  assert.match(pacing.messageFor(refusal), /one message every 30 seconds/);
  assert.match(pacing.messageFor(refusal), /20 seconds/);
});

test('the warm-up ramp raises both ceilings', () => {
  const script = `
    const pacing = require('./lib/send-pacing');
    const now = Date.parse('2026-11-20T12:00:00Z');
    const stamps = Array.from({ length: 12 }, (_, i) => now - (12 - i) * 60000);
    const state = pacing.__test.summarise(stamps, now, []);
    console.log(JSON.stringify({ limit: state.limit, warmup: state.warmup, remaining: state.remaining, rollingRemaining: state.rollingRemaining }));
  `;
  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      OUTREACH_DAILY_LIMIT: '60',
      OUTREACH_WARMUP_START: '2026-11-19',
      OUTREACH_WARMUP_START_LIMIT: '10',
      OUTREACH_WARMUP_DAILY_STEP: '5'
    }
  }).toString();
  const state = JSON.parse(output);

  assert.equal(state.limit, 15, 'day two of the ramp is 10 + 5');
  assert.equal(state.warmup.active, true);
  assert.equal(state.warmup.day, 2);
  assert.equal(state.remaining, 3);
  assert.equal(state.rollingRemaining, 3, 'the rolling window uses the same warm-up ceiling');
});
