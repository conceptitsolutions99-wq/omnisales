// A sign-in note that cannot be sent used to leave nothing but a server log line, which is
// indistinguishable from "nobody signed in". These tests pin down the record the admin panel reads.
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

const account = { name: 'Sam Rivera', email: 'sam@example.com', role: 'Sales Agent' };
const req = { headers: { 'x-forwarded-for': '198.51.100.7', 'user-agent': 'node test' } };

test('a note that cannot be sent records why, where an admin can see it', async () => {
  const result = await notify.notifySignIn({ account, req });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'not-configured');

  const last = await status.read();
  assert.equal(last.sent, false);
  assert.equal(last.reason, 'not-configured');
  assert.equal(last.to, 'ops@example.com');
  assert.ok(last.at, 'the attempt is time-stamped');
  assert.equal(last.error, null, 'nothing was thrown to report');
});

test('turning notifications off is recorded as such, not as a send', async () => {
  process.env.SIGNIN_NOTIFY_ENABLED = 'false';
  try {
    const result = await notify.notifySignIn({ account, req });
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'disabled');
    assert.equal((await status.read()).reason, 'disabled');
  } finally {
    delete process.env.SIGNIN_NOTIFY_ENABLED;
  }
});

test('a failed send keeps the error, flattened and capped so the panel stays readable', async () => {
  const saved = await status.record({
    sent: false,
    reason: 'failed',
    to: 'ops@example.com',
    error: `Invalid login\n${'x'.repeat(400)}`
  });

  assert.equal(saved.error.includes('\n'), false);
  assert.ok(saved.error.length <= 200, 'a long SMTP error cannot flood the row');
  assert.ok(saved.error.startsWith('Invalid login'));
});

test('the record carries only the address and the reason, never a password', async () => {
  const saved = await status.record({ sent: true, reason: 'sent', to: 'ops@example.com', error: null });
  assert.deepEqual(Object.keys(saved).sort(), ['at', 'error', 'reason', 'sent', 'to']);
  assert.equal(saved.error, null);
});
