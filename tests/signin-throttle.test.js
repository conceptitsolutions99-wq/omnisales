process.env.DATABASE_URL = '';

const test = require('node:test');
const assert = require('node:assert/strict');

const auth = require('../lib/auth-core');
const notify = require('../lib/signin-notify');

const NOW = Date.parse('2026-11-20T10:00:00.000Z');

test('one IP trying many accounts trips the throttle and carries the addresses', () => {
  const ip = '198.51.100.41';
  const emails = Array.from({ length: 8 }, (_, index) => `spray.${index}@example.com`);

  let last = null;
  for (const email of emails) last = auth.recordFailure(ip, email);

  assert.equal(last.count, 8);
  assert.equal(last.tripped, true, 'the eighth attempt is the one that trips the limit');
  assert.equal(auth.throttled(ip), true);
  assert.deepEqual([...last.emails].sort(), [...emails].sort(), 'every address it tried is listed');
  assert.ok(last.first > 0, 'the window start travels with the alert');
});

test('the alert fires once per window, not on every later attempt', () => {
  const ip = '198.51.100.42';
  let last = null;
  for (let index = 0; index < 8; index += 1) last = auth.recordFailure(ip, `once.${index}@example.com`);
  assert.equal(last.tripped, true);

  const later = auth.recordFailure(ip, 'later@example.com');
  assert.equal(later.tripped, false, 'the IP has already been reported');
  assert.equal(later.count, 9);
});

test('a repeat of the same address is listed once', () => {
  const ip = '198.51.100.43';
  let last = null;
  for (let index = 0; index < 8; index += 1) last = auth.recordFailure(ip, 'repeat@example.com');

  assert.deepEqual(last.emails, ['repeat@example.com']);
});

test('the notice names the IP and addresses and carries no password', () => {
  const notice = notify.buildThrottledIpNotice({
    ip: '203.0.113.77',
    emails: ['one@example.com', 'two@example.com'],
    attempts: 8,
    first: NOW - 60_000,
    at: NOW,
    device: 'curl/8.0'
  });

  assert.equal(notice.subject, 'Sign-in throttle: 203.0.113.77');
  assert.match(notice.text, /IP: 203\.0\.113\.77/);
  assert.match(notice.text, /Failed attempts in the window: 8/);
  assert.match(notice.text, /First attempt: Fri, 20 Nov 2026 09:59:00 GMT/);
  assert.match(notice.text, /Last attempt: Fri, 20 Nov 2026 10:00:00 GMT/);
  assert.match(notice.text, /Accounts it tried:\n- one@example\.com\n- two@example\.com/);
  assert.match(notice.text, /neither the attempted passwords nor the correct one is in this message/);
  assert.doesNotMatch(notice.text, /Password:/i);
  assert.doesNotMatch(notice.text, /hunter2/);
});

test('a newline in an address cannot inject extra alert lines', () => {
  const notice = notify.buildThrottledIpNotice({
    ip: '203.0.113.78',
    emails: ['spray@example.com\nBcc: attacker@example.com'],
    attempts: 8,
    at: NOW
  });

  assert.doesNotMatch(notice.text, /\nbcc:/i);
  assert.match(notice.text, /- spray@example\.com bcc: attacker@example\.com\n/);
});
