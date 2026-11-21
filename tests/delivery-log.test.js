// The delivery log is the only evidence that a message left, so two things have to hold: a row
// written by one send cannot be overwritten by a send happening at the same moment, and a write
// that fails is retried once and then reported rather than swallowed.
process.env.DATABASE_URL = '';

const test = require('node:test');
const assert = require('node:assert/strict');

const kv = require('../lib/kv-store');
const logs = require('../lib/email-log-store');

const entry = (id, sentAt) => ({ id, to: 'lead@example.com', subject: 'Hello', sentAt, status: 'sent' });

test('concurrent sends all keep their row', async () => {
  const rows = Array.from({ length: 25 }, (_, index) =>
    entry(`race-${index}`, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString())
  );

  await Promise.all(rows.map((row) => logs.record(row)));

  const ids = new Set((await logs.list(100)).map((row) => row.id));
  assert.equal(ids.size, 25, 'every concurrent record survives');
  for (const row of rows) assert.ok(ids.has(row.id), `${row.id} was not lost`);
});

test('the same id is replaced, not duplicated', async () => {
  await logs.record(entry('same-id', '2026-02-01T00:00:00.000Z'));
  await logs.record({ ...entry('same-id', '2026-02-01T00:00:00.000Z'), status: 'failed', error: 'refused' });

  const rows = (await logs.list(100)).filter((row) => row.id === 'same-id');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'failed');
});

test('a failed write is retried once and then succeeds', async () => {
  const original = kv.update;
  let attempts = 0;
  kv.update = async (...args) => {
    attempts += 1;
    if (attempts === 1) throw new Error('store unavailable');
    return original(...args);
  };

  try {
    const saved = await logs.record(entry('retry-ok', '2026-03-01T00:00:00.000Z'));
    assert.equal(saved.id, 'retry-ok');
    assert.equal(attempts, 2, 'the retry is what saved the row');
    assert.ok((await logs.list(100)).some((row) => row.id === 'retry-ok'));
  } finally {
    kv.update = original;
  }
});

test('a write that fails twice is reported to the caller', async () => {
  const original = kv.update;
  let attempts = 0;
  kv.update = async () => {
    attempts += 1;
    throw new Error('store unavailable');
  };

  try {
    await assert.rejects(
      () => logs.record(entry('retry-fail', '2026-03-02T00:00:00.000Z')),
      /store unavailable/,
      'the second failure must reach the send result, not disappear'
    );
    assert.equal(attempts, 2, 'one retry, not an endless loop');
  } finally {
    kv.update = original;
  }
});
