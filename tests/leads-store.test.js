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

// In one process the in-memory store hands back the same object to every caller, so two writers
// mutate one copy and a lost update stays hidden. Two serverless instances each hold their own
// copy of the JSON; handing out a private copy per read reproduces that.
const withPrivateReads = async (run) => {
  const kv = require('../lib/kv-store');
  const realRead = kv.read;
  kv.read = async (key, fallback) => {
    const value = await realRead(key, fallback);
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  };
  try {
    return await run();
  } finally {
    kv.read = realRead;
  }
};

const replyFor = (entry, extra = {}) => ({
  id: `reply-${entry.id}`,
  from: entry.email,
  leadName: entry.name,
  subject: 'Re: A faster website',
  receivedAt: new Date().toISOString(),
  matched: true,
  ...extra
});

test('a claim and a reply landing together both survive', async () => {
  for (let round = 0; round < 10; round += 1) {
    const entry = lead(200 + round);
    await store.upsertLeads([entry], actor);

    // One agent emails the prospect as the customer answers: the claim and the reply are in the
    // air together, and each used to write a whole list built from its own stale copy
    const claimer = { name: 'Analyst On Call', email: 'analyst@example.com' };
    await withPrivateReads(() =>
      Promise.all([
        store.claimLead({ id: entry.id, email: entry.email }, claimer),
        store.markReplied([replyFor(entry)])
      ])
    );

    const stored = (await store.listLeads()).find((row) => row.id === entry.id);
    assert.equal(stored.owner, claimer.name, `round ${round}: the claim survived the reply`);
    assert.equal(stored.ownerEmail, claimer.email);
    assert.ok(stored.repliedAt, `round ${round}: the reply survived the claim`);
    assert.equal(stored.status, 'Replied');

    // The store is shared by the whole file, so each round leaves the list as it found it
    await store.deleteLeads([entry], actor);
  }
});

test('two agents claiming the same lead at once leave one owner', async () => {
  const entry = lead(300);
  await store.upsertLeads([entry], actor);

  const first = { name: 'First Agent', email: 'first@example.com' };
  const second = { name: 'Second Agent', email: 'second@example.com' };

  await withPrivateReads(() =>
    Promise.all([
      store.claimLead({ id: entry.id, email: entry.email }, first),
      store.claimLead({ id: entry.id, email: entry.email }, second)
    ])
  );

  const stored = (await store.listLeads()).find((row) => row.id === entry.id);
  assert.equal(stored.owner, first.name, 'the claim that reached the lock first sticks');
  assert.equal(stored.ownerEmail, first.email);

  await store.deleteLeads([entry], actor);
});

test('an offer tagged in the list survives the next push, and the newest edit wins', async () => {
  const entry = { ...lead(401), solution: '' };
  await store.upsertLeads([entry], actor);
  const stored = async () => (await store.listLeads()).find((row) => row.id === entry.id);

  // A lead swept from the map has no offer; tagging it in the list is an edit with a timestamp
  await store.upsertLeads([{ ...entry, solution: 'Website', solutionAt: '2026-11-27T10:00:00.000Z' }], actor);
  assert.equal((await stored()).solution, 'Website', 'the tag is kept');

  // Changing the offer is a later edit, so it replaces the first tag
  await store.upsertLeads([{ ...entry, solution: 'Mobile App', solutionAt: '2026-11-27T10:05:00.000Z' }], actor);
  assert.equal((await stored()).solution, 'Mobile App');

  // A browser that has not synced pushes an older tag: it must not win
  await store.upsertLeads([{ ...entry, solution: 'Website', solutionAt: '2026-11-27T10:03:00.000Z' }], actor);
  assert.equal((await stored()).solution, 'Mobile App', 'an older edit does not overwrite a newer one');

  // Clearing the offer is an edit as well, and the cleared lead stays cleared
  await store.upsertLeads([{ ...entry, solution: '', solutionAt: '2026-11-27T10:10:00.000Z' }], actor);
  assert.equal((await stored()).solution, '');
  await store.upsertLeads([{ ...entry, solution: 'Website', solutionAt: '2026-11-27T10:07:00.000Z' }], actor);
  assert.equal((await stored()).solution, '', 'a stale copy cannot re-tag a cleared lead');

  await store.deleteLeads([entry], actor);
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
