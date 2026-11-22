// The delivery log is the shared record of what left the mailbox, so an admin can remove a row —
// but a row that was removed must not come back from a copy that still holds it (a warm instance,
// or a browser's own log of its sends).
process.env.DATABASE_URL = '';

const test = require('node:test');
const assert = require('node:assert/strict');

const logs = require('../lib/email-log-store');

const entry = (id, sentAt) => ({ id, to: 'lead@example.com', subject: 'Hello', sentAt, status: 'sent' });

test('an admin deletes one delivery and the other rows stay', async () => {
  await logs.record(entry('keep-1', '2026-03-01T10:00:00.000Z'));
  await logs.record(entry('gone-1', '2026-03-01T11:00:00.000Z'));

  const remaining = await logs.deleteEntries(['gone-1']);

  assert.deepEqual(remaining.map((row) => row.id), ['keep-1']);
  assert.deepEqual((await logs.list(50)).map((row) => row.id), ['keep-1']);
  assert.ok((await logs.deletedIds()).includes('gone-1'));
});

test('a deleted row cannot be restored by a later write with the same id', async () => {
  await logs.record(entry('gone-2', '2026-03-02T10:00:00.000Z'));
  await logs.deleteEntries(['gone-2']);

  // A warm instance or a retried send writes the row again; the tombstone still hides it
  await logs.record({ ...entry('gone-2', '2026-03-02T10:00:00.000Z'), status: 'sent' });

  assert.equal((await logs.list(50)).filter((row) => row.id === 'gone-2').length, 0);
});

test('an empty selection deletes nothing', async () => {
  await logs.record(entry('keep-2', '2026-03-03T10:00:00.000Z'));
  const before = (await logs.deletedIds()).length;

  const remaining = await logs.deleteEntries([]);

  assert.ok(remaining.some((row) => row.id === 'keep-2'));
  assert.equal((await logs.deletedIds()).length, before);
});
