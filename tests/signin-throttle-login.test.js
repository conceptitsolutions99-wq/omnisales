process.env.DATABASE_URL = '';
process.env.AUTH_SECRET = 'test-auth-secret';
process.env.SIGNIN_NOTIFY_ENABLED = 'false';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'AdminPass!2026';

const test = require('node:test');
const assert = require('node:assert/strict');
const login = require('../api/auth/login');
const auth = require('../lib/auth-core');
const signinNotify = require('../lib/signin-notify');
const signinFailures = require('../lib/signin-failures');

const makeResponse = () => ({
  headers: {},
  statusCode: 200,
  setHeader(name, value) {
    this.headers[name] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  }
});

const attempt = async (ip, email) => {
  const req = {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'user-agent': 'throttle-test' },
    socket: {},
    body: { email, password: 'deliberately-wrong' }
  };
  const res = makeResponse();
  await login(req, res);
  return res.statusCode;
};

test('eight failures for one address keep the IP throttle but do not send the IP spray alert', async () => {
  const ip = '198.51.100.150';
  const calls = [];
  const originalIpAlert = signinNotify.notifyThrottledIp;
  const originalAccountAlert = signinNotify.notifyFailedSignIns;
  signinNotify.notifyThrottledIp = async (args) => calls.push({ type: 'ip', ...args });
  signinNotify.notifyFailedSignIns = async (args) => calls.push({ type: 'account', ...args });
  try {
    for (let i = 0; i < 8; i += 1) {
      assert.equal(await attempt(ip, 'typo@example.com'), 401);
    }

    assert.equal(auth.throttled(ip), true, 'the request throttle remains active');
    assert.equal(calls.filter((call) => call.type === 'ip').length, 0, 'one account is not an IP spray');
  } finally {
    signinNotify.notifyThrottledIp = originalIpAlert;
    signinNotify.notifyFailedSignIns = originalAccountAlert;
    auth.clearFailures(ip);
    await signinFailures.clearFailures('typo@example.com');
  }
});

test('eight failures across three addresses send one IP alert with the distinct count', async () => {
  const ip = '198.51.100.151';
  const alerts = [];
  const originalIpAlert = signinNotify.notifyThrottledIp;
  const originalAccountAlert = signinNotify.notifyFailedSignIns;
  signinNotify.notifyThrottledIp = async (args) => alerts.push(args);
  signinNotify.notifyFailedSignIns = async () => {};
  const emails = [
    'spray.one@example.com',
    'spray.two@example.com',
    'spray.three@example.com',
    'spray.one@example.com',
    'spray.two@example.com',
    'spray.three@example.com',
    'spray.one@example.com',
    'spray.two@example.com'
  ];
  try {
    for (const email of emails) assert.equal(await attempt(ip, email), 401);

    assert.equal(alerts.length, 1, 'only the threshold-crossing attempt alerts');
    assert.equal(alerts[0].distinctAccounts, 3);
    assert.deepEqual([...alerts[0].emails].sort(), [
      'spray.one@example.com',
      'spray.three@example.com',
      'spray.two@example.com'
    ]);
  } finally {
    signinNotify.notifyThrottledIp = originalIpAlert;
    signinNotify.notifyFailedSignIns = originalAccountAlert;
    auth.clearFailures(ip);
    for (const email of new Set(emails)) await signinFailures.clearFailures(email);
  }
});
