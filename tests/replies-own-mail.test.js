// The requirements-submission note is sent from the team's own mailbox to the admin, so it lands
// in the same inbox the reply scan reads. Counted as a reply it would mark the lead Replied and
// pause outreach to a prospect who never answered.
process.env.DATABASE_URL = '';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isAppOwnMail, ownAddresses, mailAddress } = require('../lib/replies-core');

const withEnv = async (values, run) => {
  const previous = Object.entries(values).map(([name]) => [name, process.env[name]]);
  Object.entries(values).forEach(([name, value]) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
  try {
    return await run();
  } finally {
    previous.forEach(([name, value]) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    });
  }
};

const noticeHeaders = [
  'Message-ID: <notice@mail.example>',
  'Subject: Requirements answered — Aitken Legal (Website project requirements)',
  'X-Concept-Notice: requirements-submission',
  'Auto-Submitted: auto-generated',
  ''
].join('\r\n');

test('the notice from our own login is not a customer reply', async () => {
  await withEnv({ GMAIL_USER: 'team@example.com', SMTP_USER: undefined, MAIL_FROM: undefined }, () => {
    const own = ownAddresses('team@example.com');
    assert.equal(
      isAppOwnMail({
        fromAddress: 'team@example.com',
        subject: 'Requirements answered — Aitken Legal (Website project requirements)',
        headers: noticeHeaders,
        own
      }),
      true
    );
  });
});

test('a send-as alias is recognised as the app, not the customer', async () => {
  await withEnv(
    { GMAIL_USER: 'team@example.com', SMTP_USER: undefined, MAIL_FROM: 'Concept IT <sales@example.com>' },
    () => {
      const own = ownAddresses('team@example.com');
      assert.ok(own.includes('sales@example.com'), 'MAIL_FROM is one of our addresses');
      assert.equal(
        isAppOwnMail({ fromAddress: 'Sales <SALES@example.com>', subject: 'Signed in', headers: '', own }),
        true
      );
    }
  );
});

test('the notice marker is enough even from an address we did not list', async () => {
  assert.equal(
    isAppOwnMail({
      fromAddress: 'relay@example.net',
      subject: 'Requirements answered — Acme (Mobile app requirements)',
      headers: noticeHeaders,
      own: []
    }),
    true
  );
});

test('a note sent before the marker existed is still recognised by its subject', async () => {
  assert.equal(
    isAppOwnMail({
      fromAddress: 'relay@example.net',
      subject: 'Requirements answered — Acme (Website project requirements)',
      headers: 'Message-ID: <older@mail.example>\r\n',
      own: []
    }),
    true
  );
});

test('a real customer reply is not treated as our own mail', async () => {
  const own = ownAddresses('team@example.com');
  assert.equal(
    isAppOwnMail({
      fromAddress: 'owner@aitkenlegal.test',
      subject: 'Re: Requirements answered — Aitken Legal (Website project requirements)',
      headers: 'In-Reply-To: <sent-1@mail.example>\r\n',
      own
    }),
    false
  );
});

test('the address helper reads both bare and named addresses', () => {
  assert.equal(mailAddress('Team <team@example.com>'), 'team@example.com');
  assert.equal(mailAddress('team@example.com'), 'team@example.com');
  assert.equal(mailAddress(''), '');
});
