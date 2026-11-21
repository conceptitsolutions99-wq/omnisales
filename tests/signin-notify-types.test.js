// Four kinds of admin note exist and each is sent separately, so a delivered sign-in note must not
// hide a throttle alert that silently failed. These tests pin the per-kind record the checklist
// reads, including the older single-record rows written before it existed.
process.env.DATABASE_URL = '';
process.env.SIGNIN_NOTIFY_EMAIL = 'ops@example.com';
delete process.env.SIGNIN_NOTIFY_ENABLED;
delete process.env.GMAIL_USER;
delete process.env.GMAIL_APP_PASSWORD;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.ADMIN_EMAIL;

const test = require('node:test');
const assert = require('node:assert/strict');

const notify = require('../lib/signin-notify');
const status = require('../lib/signin-notify-status');
const kv = require('../lib/kv-store');

const account = { name: 'Sam Rivera', email: 'sam@example.com', role: 'Sales Agent' };
const req = { headers: { 'x-forwarded-for': '198.51.100.7', 'user-agent': 'node test' } };
const KEY = 'omnisales:signin-note-status';

test('every kind of note records its own outcome', async () => {
  await notify.notifySignIn({ account, req });
  await notify.notifyFailedSignIns({ account, ip: '198.51.100.7', attempts: 5, req });
  await notify.notifyThrottledIp({
    ip: '198.51.100.7',
    emails: ['a@example.com', 'b@example.com', 'c@example.com'],
    distinctAccounts: 3,
    attempts: 9,
    req
  });
  await notify.notifySuspendedSignIn({ account, ip: '198.51.100.7', at: Date.now(), req });

  const all = await status.readAll();
  assert.deepEqual(Object.keys(all).sort(), ['failed', 'signin', 'suspended', 'throttle']);
  for (const type of ['signin', 'failed', 'throttle', 'suspended']) {
    assert.equal(all[type].reason, 'not-configured', `${type} keeps its own reason`);
    assert.equal(all[type].to, 'ops@example.com');
  }
});

test('a failed alert does not erase the outcome of another kind', async () => {
  await kv.write(KEY, {});
  await status.record({ type: 'signin', sent: true, reason: 'sent', to: 'ops@example.com' });
  await status.record({
    type: 'throttle',
    sent: false,
    reason: 'failed',
    to: 'ops@example.com',
    error: 'Invalid login'
  });

  assert.equal((await status.read('signin')).sent, true, 'the working kind stays Ready');
  assert.equal((await status.read('throttle')).reason, 'failed', 'the failing kind shows Missing');
  assert.equal((await status.read('suspended')), null, 'an unattempted kind reports nothing');
});

test('an older single-record row is read as the staff sign-in note', async () => {
  const legacy = {
    at: '2026-11-21T17:44:01.986Z',
    sent: true,
    reason: 'sent',
    to: 'ops@example.com',
    error: null
  };
  await kv.write(KEY, legacy);

  const all = await status.readAll();
  assert.deepEqual(Object.keys(all), ['signin']);
  assert.equal(all.signin.at, legacy.at);

  // Recording another kind upgrades the row without losing the legacy sign-in note
  await status.record({ type: 'suspended', sent: true, reason: 'sent', to: 'ops@example.com' });
  const after = await status.readAll();
  assert.equal(after.signin.at, legacy.at);
  assert.equal(after.suspended.reason, 'sent');
});

test('an unknown kind is stored as a sign-in note rather than under a new key', async () => {
  const saved = await status.record({ type: 'nonsense', sent: true, reason: 'sent', to: 'ops@example.com' });
  assert.ok(saved.at);
  assert.equal((await status.read('signin')).reason, 'sent');
  assert.equal((await status.read('nonsense')), null);
});
