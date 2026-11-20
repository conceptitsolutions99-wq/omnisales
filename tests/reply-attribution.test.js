const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveReply } = require('../lib/reply-attribution');

const SENT = [
  {
    messageId: 'abc123@mail.example',
    agent: 'Sarah Jenkins',
    agentEmail: 'sarah@example.com',
    leadName: 'Acme',
    to: 'lead@acme.test'
  }
];

test('a reply keeps the sender account address from the app index', () => {
  // The IMAP scan only knows the display name stamped in the sent header
  const reply = {
    id: 'r1',
    from: 'lead@acme.test',
    messageIds: ['abc123@mail.example'],
    agent: 'Sarah Jenkins'
  };
  const result = resolveReply(reply, SENT, {});

  assert.equal(result.agent, 'Sarah Jenkins');
  assert.equal(result.agentEmail, 'sarah@example.com');
  assert.equal(result.matched, true, 'the Message-ID still proves the thread is ours');
});

test('the account address survives a rename because the index is keyed by Message-ID', () => {
  const reply = {
    id: 'r2',
    from: 'lead@acme.test',
    messageIds: ['ABC123@mail.example'],
    // The header still says the old name; the address is what identifies the employee
    agent: 'Sarah J. (Sales)'
  };
  const result = resolveReply(reply, SENT, {});

  assert.equal(result.agentEmail, 'sarah@example.com');
});

test('an admin assignment carries the assigned account address', () => {
  const result = resolveReply(
    { id: 'r3', from: 'lead@acme.test', messageIds: ['unknown@mail.example'], agent: 'Sarah Jenkins' },
    SENT,
    { r3: { name: 'Omar', email: 'OMAR@example.com', by: 'boss@example.com' } }
  );

  assert.equal(result.agent, 'Omar');
  assert.equal(result.agentEmail, 'omar@example.com');
  assert.equal(result.manual, true);
});

test('rows with no address still fall back to the display name', () => {
  const result = resolveReply(
    { id: 'r4', from: 'lead@acme.test', messageIds: ['older@mail.example'], agent: 'Legacy Agent' },
    [],
    {}
  );

  assert.equal(result.agent, 'Legacy Agent');
  assert.equal(result.agentEmail, null);
});

test('a recipient-only match does not borrow another agent’s address', () => {
  // The sender header names someone else; the latest send to that address is Sarah's
  const result = resolveReply(
    { id: 'r5', from: 'lead@acme.test', messageIds: ['unknown@mail.example'], agent: 'Omar' },
    SENT,
    {}
  );

  assert.equal(result.agent, 'Omar');
  assert.equal(result.agentEmail, null, 'the name is kept but no unrelated address is attached');
});
