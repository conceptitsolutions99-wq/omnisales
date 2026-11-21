process.env.DATABASE_URL = '';
process.env.AUTH_SECRET = 'suspended-test-secret';
process.env.SIGNIN_NOTIFY_ENABLED = 'false';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'AdminPass!2026';

const test = require('node:test');
const assert = require('node:assert/strict');

const login = require('../api/auth/login');
const store = require('../lib/user-store');
const notify = require('../lib/signin-notify');

const makeResponse = () => ({
  statusCode: 200,
  setHeader() {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  }
});

const attempt = async (email, password, ip = '198.51.100.201') => {
  const res = makeResponse();
  await login(
    {
      method: 'POST',
      headers: { 'x-forwarded-for': ip, 'user-agent': 'suspended-test' },
      socket: {},
      body: { email, password }
    },
    res
  );
  return res.statusCode;
};

test('a suspended account with the right password alerts the admin and is still refused', async () => {
  const email = 'former.employee@example.com';
  const { tempPassword } = await store.createUser({
    name: 'Former Employee',
    email,
    role: 'Sales Agent',
    permissions: { leads: true, dialler: true, analytics: false, followups: true, admin: false }
  });
  await store.setStatus(email, 'Suspended');

  const alerts = [];
  const original = notify.notifySuspendedSignIn;
  notify.notifySuspendedSignIn = async (args) => alerts.push(args);
  try {
    assert.equal(await attempt(email, tempPassword), 401, 'the suspension still refuses the sign-in');
    assert.equal(alerts.length, 1, 'the admin is told the credential is still valid');
    assert.equal(alerts[0].account.email, email);

    // A wrong password is an ordinary failure, not a live credential
    assert.equal(await attempt(email, 'definitely-wrong'), 401);
    assert.equal(alerts.length, 1, 'a wrong password does not repeat the alert');
  } finally {
    notify.notifySuspendedSignIn = original;
    await store.deleteUser(email);
  }
});

test('the suspended notice names the account and never carries a password', () => {
  const notice = notify.buildSuspendedSignInNotice({
    account: { name: 'Former Employee', email: 'former.employee@example.com', role: 'Sales Agent' },
    ip: '203.0.113.9',
    at: Date.parse('2026-11-21T18:30:00.000Z'),
    device: 'Chrome on Windows'
  });

  assert.equal(notice.subject, 'Suspended account sign-in: Former Employee (former.employee@example.com)');
  assert.match(notice.text, /correct password/);
  assert.match(notice.text, /Suspended account|suspended/);
  assert.match(notice.text, /IP: 203\.0\.113\.9/);
  assert.match(notice.text, /Attempt: Sat, 21 Nov 2026 18:30:00 GMT/);
  assert.match(notice.text, /Reset the password or delete the account/);
  assert.doesNotMatch(notice.text, /Password:/i);
});

test('a newline in a display name cannot inject extra alert lines', () => {
  const notice = notify.buildSuspendedSignInNotice({
    account: { name: 'Former\nBcc: attacker@example.com', email: 'x@example.com', role: 'Sales Agent' },
    ip: '203.0.113.10',
    at: Date.now()
  });

  assert.doesNotMatch(notice.text, /\nbcc:/i);
});
