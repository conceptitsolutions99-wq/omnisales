process.env.AUTH_SECRET = 'session-test-secret';
process.env.DATABASE_URL = '';
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

const test = require('node:test');
const assert = require('node:assert/strict');

const auth = require('../lib/auth-core');
const store = require('../lib/user-store');

const EMAIL = 'session.qa@example.com';
const withCookie = (token) => ({ headers: { cookie: `cit_session=${token}` } });

const signIn = async (email) => auth.createSession(await auth.resolveAccount(email));

test('a live account keeps its session', async () => {
  await store.createUser({ name: 'Session QA', email: EMAIL, role: 'Sales Agent' });
  await store.setPassword(EMAIL, 'AgentPass!2026');

  const token = await signIn(EMAIL);
  const session = await auth.getSession(withCookie(token));

  assert.equal(session.email, EMAIL);
  assert.equal(session.role, 'Sales Agent');
});

test('suspending an account rejects the session already in the browser', async () => {
  const token = await signIn(EMAIL);
  assert.ok(await auth.getSession(withCookie(token)));

  await store.setStatus(EMAIL, 'Suspended');
  assert.equal(await auth.getSession(withCookie(token)), null);

  // Re-activating must not revive the old cookie: the version moved when it was suspended
  await store.setStatus(EMAIL, 'Active');
  assert.equal(await auth.getSession(withCookie(token)), null);

  const fresh = await signIn(EMAIL);
  assert.ok(await auth.getSession(withCookie(fresh)));
});

test('deleting an account rejects the session already in the browser', async () => {
  const token = await signIn(EMAIL);
  assert.ok(await auth.getSession(withCookie(token)));

  await store.deleteUser(EMAIL);
  assert.equal(await auth.getSession(withCookie(token)), null);
});

test('re-creating the same address does not revive the deleted account’s session', async () => {
  // The previous test removed the account, so this one starts from a fresh owner
  await store.createUser({ name: 'Old Owner', email: EMAIL, role: 'Sales Agent' });
  await store.setPassword(EMAIL, 'AgentPass!2026');

  const oldToken = await signIn(EMAIL);
  assert.ok(await auth.getSession(withCookie(oldToken)));

  await store.deleteUser(EMAIL);
  await store.createUser({ name: 'New Owner', email: EMAIL, role: 'Sales Agent' });
  await store.setPassword(EMAIL, 'AgentPass!2027');

  assert.equal(
    await auth.getSession(withCookie(oldToken)),
    null,
    'a new account starts on a new session version'
  );

  const fresh = await signIn(EMAIL);
  const session = await auth.getSession(withCookie(fresh));
  assert.equal(session.name, 'New Owner');
});

test('a role change applies to an existing session on the next request', async () => {
  const token = await signIn(EMAIL);
  await store.updateUser(EMAIL, { role: 'Analyst' });

  const session = await auth.getSession(withCookie(token));
  assert.equal(session.role, 'Analyst');
});

test('the password-change gate follows the current account', async () => {
  await store.resetPassword(EMAIL);
  const token = await signIn(EMAIL);

  const session = await auth.getSession(withCookie(token));
  assert.equal(session.mustChange, true);

  const res = {
    code: 0,
    body: null,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  const blocked = await auth.requireActiveSession(withCookie(token), res);

  assert.equal(blocked, null);
  assert.equal(res.code, 403);
  assert.equal(res.body.code, 'PASSWORD_CHANGE_REQUIRED');
});
