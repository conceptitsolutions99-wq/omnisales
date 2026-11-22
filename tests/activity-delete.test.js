// The history is shared and every browser caches its own copy, so a deleted entry could come back
// on the next sync. These tests pin the tombstones that stop that, and the per-entry delete.
process.env.DATABASE_URL = '';

const test = require('node:test');
const assert = require('node:assert/strict');

const store = require('../lib/activity-store');

const actor = { name: 'Admin', email: 'admin@example.com' };

const entry = (id, leadName) => ({
  id,
  channel: 'Call',
  leadName,
  company: leadName,
  caller: 'Admin',
  callerEmail: 'admin@example.com',
  outcome: 'Contacted',
  duration: '1m 00s',
  timestamp: `2026-11-21 10:0${String(id).slice(-1)}`
});

test('an admin deletes one selected entry and the other entries stay', async () => {
  await store.addActivity([entry('del-1', 'Alpha Ltd'), entry('del-2', 'Beta Ltd')], actor);

  const remaining = await store.deleteActivity({ ids: ['del-1'] });
  assert.deepEqual(remaining.map((row) => row.leadName), ['Beta Ltd']);
  assert.deepEqual((await store.listActivity()).map((row) => row.leadName), ['Beta Ltd']);
});

test('a deleted entry is not restored by the browser that recorded it', async () => {
  const original = entry('del-3', 'Gamma Ltd');
  await store.addActivity([original], actor);
  const [stored] = await store.listActivity();
  assert.equal(stored.leadName, 'Gamma Ltd');
  const keys = await store.listDeletedKeys();

  // The key the browser sends is the same one the store computed for this entry: an entry with an
  // id is identified by it, so two sends of one event cannot be counted twice
  const eventKey = `id:${stored.id}|gamma ltd`;
  await store.deleteActivity({ keys: [eventKey] });
  assert.equal(
    (await store.listActivity()).some((row) => row.leadName === 'Gamma Ltd'),
    false,
    'the selected entry is gone'
  );
  assert.equal((await store.listDeletedKeys()).includes(eventKey), true);
  assert.equal(keys.includes(eventKey), false, 'it was not deleted before this call');

  // The employee's cached copy is pushed back on their next sync
  await store.addActivity([{ ...original, caller: 'Admin', callerEmail: actor.email }], actor);
  const afterPush = await store.listActivity();
  assert.equal(
    afterPush.some((row) => row.leadName === 'Gamma Ltd'),
    false,
    'the tombstone keeps the deleted entry out'
  );
});

test('clearing the history also stops a cached copy from coming back', async () => {
  await store.addActivity([entry('del-4', 'Delta Ltd')], actor);
  await store.clearActivity();
  assert.deepEqual(await store.listActivity(), []);

  await store.addActivity([entry('del-4', 'Delta Ltd')], actor);
  assert.deepEqual(await store.listActivity(), []);
});

test('an empty selection changes nothing', async () => {
  await store.addActivity([entry('del-5', 'Epsilon Ltd')], actor);
  const before = await store.listActivity();
  const after = await store.deleteActivity({ keys: [], ids: [] });
  assert.deepEqual(after, before);
  assert.equal((await store.listActivity()).length, before.length);
});

test('a key that matches no entry deletes nothing', async () => {
  const before = await store.listActivity();
  const after = await store.deleteActivity({ keys: ['call|nobody|nothing|2026-01-01 00:00'] });
  assert.deepEqual(after, before);
});

test('undo puts a deleted entry back, still credited to the employee who recorded it', async () => {
  const agent = { name: 'Zeta Agent', email: 'zeta@example.com' };
  // A fresh browser entry carries no owner yet: the store credits it to the session that recorded it
  const { callerEmail, ...fresh } = entry('undo-1', 'Zeta Ltd');
  await store.addActivity([fresh], agent);
  const [stored] = (await store.listActivity()).filter((row) => row.leadName === 'Zeta Ltd');

  await store.deleteActivity({ ids: ['undo-1'] });
  assert.equal((await store.listActivity()).some((row) => row.leadName === 'Zeta Ltd'), false);

  const restored = await store.restoreActivity([stored]);
  const row = restored.find((item) => item.leadName === 'Zeta Ltd');
  assert.ok(row, 'the entry is back');
  assert.equal(row.caller, 'Zeta Agent', 'the undo does not re-credit the row to the admin');
  assert.equal(row.callerEmail, 'zeta@example.com');
  assert.equal(
    (await store.listDeletedKeys()).includes(`id:undo-1|zeta ltd`),
    false,
    'its tombstone is gone, so the entry stays'
  );
});

test('clearing the whole history hands back the rows so the admin can undo it', async () => {
  await store.addActivity([entry('clear-1', 'Iota Ltd'), entry('clear-2', 'Kappa Ltd')], actor);
  const before = (await store.listActivity()).map((row) => row.leadName).sort();
  assert.ok(before.includes('Iota Ltd') && before.includes('Kappa Ltd'));

  const cleared = await store.clearActivity();
  assert.deepEqual(await store.listActivity(), [], 'the history is empty after the clear');
  assert.deepEqual(
    cleared.map((row) => row.leadName).sort(),
    before,
    'the clear names every row it removed'
  );

  // The admin's undo sends those rows back, and the clear's tombstones must not keep them out
  const restored = await store.restoreActivity(cleared);
  assert.deepEqual(restored.map((row) => row.leadName).sort(), before);
  assert.deepEqual((await store.listActivity()).map((row) => row.leadName).sort(), before);
});

test('undoing one entry does not bring back another entry that was deleted', async () => {
  await store.addActivity([entry('undo-2', 'Eta Ltd'), entry('undo-3', 'Theta Ltd')], actor);
  const rows = await store.listActivity();
  const eta = rows.find((row) => row.leadName === 'Eta Ltd');

  await store.deleteActivity({ ids: ['undo-2', 'undo-3'] });
  await store.restoreActivity([eta]);

  const after = await store.listActivity();
  assert.equal(after.some((row) => row.leadName === 'Eta Ltd'), true);
  assert.equal(after.some((row) => row.leadName === 'Theta Ltd'), false);
});
