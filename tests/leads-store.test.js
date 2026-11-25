// Every open browser keeps its own copy of the lead list and pushes it back after each change, so
// an admin's delete and an employee's push can be in flight together. The delete has to win: the
// push must not write the lead back, and the row lock is what makes that hold.
process.env.DATABASE_URL = '';

const test = require('node:test');
const assert = require('node:assert/strict');

const store = require('../lib/leads-store');

const actor = { name: 'Administrator', email: 'admin@example.com' };
const lead = (index) => ({
  id: `race-${index}`,
  name: `Race Street Cafe ${index}`,
  phone: `+1 416 555 ${String(1000 + index)}`,
  email: `race${index}@example.com`,
  country: 'Canada',
  region: 'Toronto',
  status: 'New'
});

test('a delete survives a push sent at the same moment', async () => {
  for (let round = 0; round < 20; round += 1) {
    const entry = lead(round);
    await store.upsertLeads([entry], actor);
    assert.equal((await store.listLeads()).length, 1, `round ${round}: the lead starts on the list`);

    // The push carries a copy made before the delete; both are in flight together
    await Promise.all([store.deleteLeads([entry], actor), store.upsertLeads([entry], actor)]);

    const ids = (await store.listLeads()).map((row) => row.id);
    assert.ok(!ids.includes(entry.id), `round ${round}: the push put the deleted lead back`);
    assert.ok(
      (await store.listDeleted()).includes(`phone:${entry.phone.replace(/\D/g, '').slice(-10)}`),
      `round ${round}: the deleted key is remembered`
    );
  }
});

test('a delete survives a push whose write lands after it', async () => {
  const entry = lead(99);
  await store.upsertLeads([entry], actor);

  // A push that read the list before the delete: hold its write until the delete has gone through
  const kv = require('../lib/kv-store');
  const realRead = kv.read;
  const realWrite = kv.write;
  const stale = await realRead('omnisales:leads', {});
  let releasePush;
  const pushWriting = new Promise((resolve) => {
    releasePush = resolve;
  });
  let held = false;

  kv.read = async (key, fallback) => (key === 'omnisales:leads' ? stale : realRead(key, fallback));
  kv.write = async (key, value) => {
    if (key === 'omnisales:leads' && !held) {
      held = true;
      await pushWriting;
    }
    return realWrite(key, value);
  };

  try {
    const push = store.upsertLeads([entry], actor);
    await store.deleteLeads([entry], actor);
    releasePush();
    await push;
  } finally {
    kv.read = realRead;
    kv.write = realWrite;
  }

  assert.equal((await store.listLeads()).length, 0, 'the deleted lead was not put back by the push');
});
