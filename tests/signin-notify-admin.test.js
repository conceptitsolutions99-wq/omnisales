// The owner's own sign-in is not news; a staff account with admin rights is. This pins the line
// between the two, which used to suppress every admin note.
process.env.DATABASE_URL = '';
process.env.ADMIN_EMAIL = 'owner@example.com';
delete process.env.SIGNIN_NOTIFY_ENABLED;
delete process.env.GMAIL_USER;
delete process.env.GMAIL_APP_PASSWORD;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

const test = require('node:test');
const assert = require('node:assert/strict');

const notify = require('../lib/signin-notify');
const status = require('../lib/signin-notify-status');

const req = { headers: { 'x-forwarded-for': '198.51.100.61', 'user-agent': 'node test' } };

test('a staff account with admin rights is reported like anyone else', async () => {
  const result = await notify.notifySignIn({
    account: {
      name: 'Second Admin',
      email: 'second.admin@example.com',
      role: 'Admin',
      permissions: { admin: true }
    },
    req
  });

  assert.notEqual(result.reason, 'admin', 'only the owner is skipped');
  assert.equal(result.reason, 'not-configured', 'SMTP is not set in this test');

  const last = await status.read();
  assert.equal(last.reason, 'not-configured', 'the attempt is recorded for the checklist');
});

test("the owner's own sign-in is not reported", async () => {
  const before = await status.read();
  const result = await notify.notifySignIn({
    account: {
      name: 'Owner',
      email: 'Owner@Example.com',
      role: 'Admin',
      permissions: { admin: true }
    },
    req
  });

  assert.equal(result.reason, 'admin');
  assert.deepEqual(await status.read(), before, 'no attempt is recorded for the owner');
});
