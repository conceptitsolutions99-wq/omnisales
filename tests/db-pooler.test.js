// Supabase's session pooler allows about 15 clients, which a burst of serverless instances can
// exhaust, so the app talks to the transaction pooler instead. These tests pin which URLs are
// rewritten, which are left alone, and how many connections an instance keeps.
const test = require('node:test');
const assert = require('node:assert/strict');

const kv = require('../lib/kv-store');

const SESSION_URL =
  'postgresql://omnisales_app.abc123:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';

test('a Supabase session-pooler URL moves to the transaction pooler', () => {
  const url = new URL(kv.connectionStringFor(SESSION_URL));
  assert.equal(url.port, '6543');
  assert.equal(url.hostname, 'aws-0-eu-central-1.pooler.supabase.com');
  assert.equal(url.username, 'omnisales_app.abc123', 'credentials survive the rewrite');
  assert.equal(url.pathname, '/postgres');
});

test('a Supabase pooler URL without an explicit port also moves', () => {
  const url = new URL(kv.connectionStringFor(SESSION_URL.replace(':5432', '')));
  assert.equal(url.port, '6543');
});

test('DB_POOL_MODE=session keeps the session pooler, for a project that needs it', () => {
  process.env.DB_POOL_MODE = 'session';
  try {
    assert.equal(kv.connectionStringFor(SESSION_URL), SESSION_URL);
  } finally {
    delete process.env.DB_POOL_MODE;
  }
});

test('everything that is not a session-mode Supabase pooler is left alone', () => {
  const untouched = [
    SESSION_URL.replace(':5432', ':6543'),
    'postgresql://postgres:secret@db.abcdefghijkl.supabase.co:5432/postgres',
    'postgresql://omnisales_app:secret@127.0.0.1:5432/omnisales',
    'postgresql://user:pass@localhost:5433/omnisales',
    ''
  ];
  for (const value of untouched) {
    assert.equal(kv.connectionStringFor(value), value, `left as given: ${value || '(empty)'}`);
  }
});

test('an instance keeps one connection on Vercel and the old small pool locally', () => {
  assert.equal(kv.poolMaxFor({}), 3);
  assert.equal(kv.poolMaxFor({ VERCEL: '1' }), 1);
  assert.equal(kv.poolMaxFor({ VERCEL: '1', DB_POOL_MAX: '4' }), 4, 'the override wins');
  assert.equal(kv.poolMaxFor({ DB_POOL_MAX: 'nonsense' }), 3, 'a bad override falls back');
});
