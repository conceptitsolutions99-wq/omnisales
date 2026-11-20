process.env.DATABASE_URL = '';
process.env.SIGNIN_FAILURE_ALERT_THRESHOLD = '3';
process.env.SIGNIN_FAILURE_WINDOW_MINUTES = '1';

const test = require('node:test');
const assert = require('node:assert/strict');

const failures = require('../lib/signin-failures');
const notify = require('../lib/signin-notify');

const NOW = Date.parse('2026-11-20T10:00:00.000Z');

test('three wrong passwords in a row alert once, not on every later attempt', async () => {
  const email = 'failure.streak@example.com';
  await failures.clearFailures(email);

  const first = await failures.recordFailure(email, { ip: '203.0.113.4', at: NOW });
  const second = await failures.recordFailure(email, { ip: '203.0.113.4', at: NOW + 5_000 });
  assert.equal(first.shouldAlert, false);
  assert.equal(second.shouldAlert, false);
  assert.equal(second.count, 2);

  const third = await failures.recordFailure(email, { ip: '203.0.113.9', at: NOW + 10_000 });
  assert.equal(third.shouldAlert, true);
  assert.equal(third.count, 3);
  assert.equal(third.ip, '203.0.113.9');

  const fourth = await failures.recordFailure(email, { ip: '203.0.113.9', at: NOW + 15_000 });
  assert.equal(fourth.shouldAlert, false, 'the streak has already been reported');
  assert.equal(fourth.count, 4);
});

test('a successful sign-in clears the streak and a new run can alert again', async () => {
  const email = 'failure.reset@example.com';
  await failures.clearFailures(email);

  await failures.recordFailure(email, { at: NOW });
  await failures.recordFailure(email, { at: NOW + 1_000 });
  assert.equal((await failures.recordFailure(email, { at: NOW + 2_000 })).shouldAlert, true);

  await failures.clearFailures(email);

  const afterReset = await failures.recordFailure(email, { at: NOW + 3_000 });
  assert.equal(afterReset.count, 1);
  assert.equal(afterReset.shouldAlert, false);

  await failures.recordFailure(email, { at: NOW + 4_000 });
  assert.equal((await failures.recordFailure(email, { at: NOW + 5_000 })).shouldAlert, true);
});

test('a long gap starts a new streak instead of carrying the old count', async () => {
  const email = 'failure.window@example.com';
  await failures.clearFailures(email);

  await failures.recordFailure(email, { at: NOW });
  await failures.recordFailure(email, { at: NOW + 1_000 });

  // More than the one-minute window later, the run starts again from one
  const fresh = await failures.recordFailure(email, { at: NOW + 2 * 60 * 1000 });
  assert.equal(fresh.count, 1);
  assert.equal(fresh.shouldAlert, false);
});

test('streaks are counted per account', async () => {
  const first = 'failure.one@example.com';
  const second = 'failure.two@example.com';
  await failures.clearFailures(first);
  await failures.clearFailures(second);

  await failures.recordFailure(first, { at: NOW });
  await failures.recordFailure(first, { at: NOW + 1_000 });
  await failures.recordFailure(second, { at: NOW + 2_000 });

  assert.equal((await failures.recordFailure(second, { at: NOW + 3_000 })).count, 2);
  assert.equal((await failures.recordFailure(second, { at: NOW + 4_000 })).shouldAlert, true);
});

test('the admin alert names the account, IP and time and carries no password', () => {
  const notice = notify.buildFailedSignInNotice({
    account: { name: 'Sam Rivera', email: 'sam@example.com', role: 'Sales Agent' },
    ip: '198.51.100.7',
    attempts: 3,
    at: NOW,
    device: 'Chrome on Windows'
  });

  assert.match(notice.text, /Account: Sam Rivera <sam@example\.com>/);
  assert.match(notice.text, /Role: Sales Agent/);
  assert.match(notice.text, /Consecutive failed attempts: 3/);
  assert.match(notice.text, /Last attempt: Fri, 20 Nov 2026 10:00:00 GMT/);
  assert.match(notice.text, /IP: 198\.51\.100\.7/);
  assert.match(notice.text, /Device: Chrome on Windows/);
  assert.match(notice.text, /neither the attempted password nor the correct one is in this message/);
  assert.doesNotMatch(notice.text, /Password:\s/i);
  assert.doesNotMatch(notice.text, /hunter2/);
  assert.match(notice.subject, /Failed sign-ins: Sam Rivera \(sam@example\.com\)/);
});

test('a newline in a display name cannot inject extra alert lines', () => {
  const notice = notify.buildFailedSignInNotice({
    account: {
      name: 'Sam\nBcc: attacker@example.com',
      email: 'sam@example.com',
      role: 'Sales Agent'
    },
    ip: '198.51.100.7',
    attempts: 3,
    at: NOW
  });

  assert.doesNotMatch(notice.text, /\nBcc:/);
  assert.match(notice.text, /Account: Sam Bcc: attacker@example\.com <sam@example\.com>/);
});
