// Each of these stores keeps one shared list for the whole team: follow-ups, what was sent, the
// WhatsApp proof index and the outreach history. Two devices reading that list, changing their own
// copy and writing the whole list back used to lose one of the two changes. The stores now do the
// read and the write under the row lock; these tests put two writers in flight at once and check
// both changes are still there. The read hook hands out a private copy per read, as two serverless
// instances would (in one process the memory store would otherwise share one object).
process.env.DATABASE_URL = '';

const test = require('node:test');
const assert = require('node:assert/strict');

const { withPrivateReads } = require('./private-reads');
const followups = require('../lib/followups-store');
const sendPacing = require('../lib/send-pacing');
const suppression = require('../lib/suppression-store');
const kv = require('../lib/kv-store');
const replies = require('../lib/replies-store');
const proofs = require('../lib/whatsapp-proof-store');
const activity = require('../lib/activity-store');

const actor = { name: 'Sarah', email: 'sarah@example.com' };
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test('two follow-ups scheduled at the same moment both reach the queue', async () => {
  const first = { id: `f-${stamp()}`, leadName: 'Alpha Cafe', type: 'Call Back', status: 'Scheduled' };
  const second = { id: `f-${stamp()}`, leadName: 'Beta Cafe', type: 'Call Back', status: 'Scheduled' };

  await withPrivateReads(() =>
    Promise.all([
      followups.upsertFollowups([first], actor),
      followups.upsertFollowups([second], actor)
    ])
  );

  const ids = (await followups.listFollowups()).map((task) => String(task.id));
  assert.ok(ids.includes(first.id), 'the first task survived');
  assert.ok(ids.includes(second.id), 'the second task survived');
});

test('a reply cancelling a task does not drop a task scheduled at the same moment', async () => {
  const replied = { id: `f-${stamp()}`, leadId: 'lead-1', leadName: 'Alpha', type: 'Call Back', status: 'Scheduled' };
  const fresh = { id: `f-${stamp()}`, leadId: 'lead-2', leadName: 'Beta', type: 'Call Back', status: 'Scheduled' };
  await followups.upsertFollowups([replied], actor);

  await withPrivateReads(() =>
    Promise.all([
      followups.cancelForRepliedLeads([{ id: 'lead-1' }]),
      followups.upsertFollowups([fresh], actor)
    ])
  );

  const tasks = await followups.listFollowups();
  const byId = new Map(tasks.map((task) => [String(task.id), task]));
  assert.equal(byId.get(replied.id)?.status, 'Cancelled', 'the reply still closed its task');
  assert.ok(byId.has(fresh.id), 'the new task was not written over');
});

test('two sent messages recorded at once both reach the sent index', async () => {
  const first = `msg-${stamp()}@example.com`;
  const second = `msg-${stamp()}@example.com`;

  await withPrivateReads(() =>
    Promise.all([
      replies.rememberSent({ messageId: first, agent: actor.name, agentEmail: actor.email, leadName: 'Alpha', to: 'alpha@example.com', subject: 'Intro' }),
      replies.rememberSent({ messageId: second, agent: actor.name, agentEmail: actor.email, leadName: 'Beta', to: 'beta@example.com', subject: 'Intro' })
    ])
  );

  const ids = (await replies.listSent()).map((row) => row.messageId);
  assert.ok(ids.includes(first), 'the first message is on file');
  assert.ok(ids.includes(second), 'the second message is on file');
});

test('two reply assignments made at once both stick', async () => {
  const one = `reply-${stamp()}`;
  const two = `reply-${stamp()}`;

  await withPrivateReads(() =>
    Promise.all([
      replies.setAssignment(one, { agent: 'Sarah', assignedAt: '2026-11-27T10:00:00.000Z' }),
      replies.setAssignment(two, { agent: 'Michael', assignedAt: '2026-11-27T10:01:00.000Z' })
    ])
  );

  const all = await replies.listAssignments();
  assert.equal(all[one]?.agent, 'Sarah');
  assert.equal(all[two]?.agent, 'Michael');
});

test('two WhatsApp proofs saved at once both reach the review index', async () => {
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

  await withPrivateReads(() =>
    Promise.all([
      proofs.addProof({ leadName: 'Alpha Cafe', images: [image] }, actor),
      proofs.addProof({ leadName: 'Beta Cafe', images: [image] }, actor)
    ])
  );

  const names = (await proofs.listProofs()).map((proof) => proof.leadName);
  assert.ok(names.includes('Alpha Cafe'), 'the first proof is listed');
  assert.ok(names.includes('Beta Cafe'), 'the second proof is listed');
});

test('two activity entries logged at once both reach the shared history', async () => {
  const first = { id: `a-${stamp()}`, channel: 'Call', leadName: 'Alpha', callerEmail: actor.email, timestamp: new Date().toISOString() };
  const second = { id: `a-${stamp()}`, channel: 'Email', leadName: 'Beta', callerEmail: actor.email, timestamp: new Date().toISOString() };

  await withPrivateReads(() =>
    Promise.all([activity.addActivity([first], actor), activity.addActivity([second], actor)])
  );

  const ids = (await activity.listActivity()).map((entry) => String(entry.id));
  assert.ok(ids.includes(first.id), 'the first entry survived');
  assert.ok(ids.includes(second.id), 'the second entry survived');
});

// The worst of the remaining ones: the send limiter protects the team's one mailbox. A lost
// reservation lets two messages leave inside the same spacing window, and a lost slot count can
// spend the whole day's allowance in one burst.
test('two sends at the same moment cannot both take a slot', async () => {
  const key = 'omnisales:send-pacing';
  await kv.update(key, [], () => []);

  const results = await withPrivateReads(() => Promise.all([sendPacing.reserve(), sendPacing.reserve()]));

  const accepted = results.filter((result) => result.ok);
  const refused = results.filter((result) => !result.ok);
  assert.equal(accepted.length, 1, 'only one send may take the slot');
  assert.equal(refused.length, 1);
  assert.equal(refused[0].reason, 'spacing', 'the second send waits for the gap');

  const stored = await kv.read(key, []);
  assert.equal(stored.length, 1, 'the row holds exactly the one reservation');

  // The refused attempt must not have left the mailbox blocked for the accepted one
  await sendPacing.release(accepted[0].stamp);
});

test('two opt-outs recorded at once both stick', async () => {
  const first = `opt-${stamp()}@example.com`;
  const second = `opt-${stamp()}@example.com`;

  await withPrivateReads(() =>
    Promise.all([
      suppression.suppress(first, { reason: 'unsubscribed', source: 'link' }),
      suppression.suppress(second, { reason: 'bounced', source: 'smtp' })
    ])
  );

  assert.ok(await suppression.findSuppressed(first), 'the first opt-out is on file');
  assert.ok(await suppression.findSuppressed(second), 'the second opt-out is on file');
});

test('two activity deletes at once keep both sets of tombstones', async () => {
  const first = { id: `a-${stamp()}`, channel: 'Call', leadName: 'Gamma', callerEmail: actor.email, timestamp: new Date().toISOString() };
  const second = { id: `a-${stamp()}`, channel: 'Call', leadName: 'Delta', callerEmail: actor.email, timestamp: new Date().toISOString() };
  await activity.addActivity([first, second], actor);

  await withPrivateReads(() =>
    Promise.all([
      activity.deleteActivity({ ids: [String(first.id)] }),
      activity.deleteActivity({ ids: [String(second.id)] })
    ])
  );

  const entries = await Promise.all([activity.listActivity(), activity.listDeletedKeys()]);
  const remainingIds = entries[0].map((entry) => String(entry.id));
  const deleted = entries[1];
  assert.ok(!remainingIds.includes(String(first.id)), 'the first entry is gone');
  assert.ok(!remainingIds.includes(String(second.id)), 'the second entry is gone');
  assert.equal(deleted.length >= 2, true, 'both deletes left their tombstone');
});
