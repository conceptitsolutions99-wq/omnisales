// The note that goes out when a customer fills in a form an agent shared over WhatsApp has to
// name the customer, the form and what they ticked, and reach only the people who need it.
process.env.DATABASE_URL = '';

const test = require('node:test');
const assert = require('node:assert/strict');

const notify = require('../lib/requirements-notify');

const request = {
  token: 'tok-1',
  type: 'website',
  leadName: 'Aitken Legal',
  company: 'Aitken Legal',
  leadEmail: 'buyer@example.com',
  agent: 'Seif',
  agentEmail: 'seif@example.com',
  submittedAt: '2026-11-27T10:00:00.000Z',
  details: {
    phone: '+1 555 0100',
    budget: '50,000 EGP',
    deadline: '2026-12-20',
    description: 'A booking site\nwith payments'
  },
  answers: {
    type: ['Booking & appointments'],
    features: ['Contact form', 'WhatsApp button']
  }
};

const withEnv = async (name, value, run) => {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
};

test('the notice names the customer, the form and every ticked option', () => {
  const notice = notify.buildSubmissionNotice({ request, origin: 'https://app.example' });

  assert.match(notice.subject, /Aitken Legal/);
  assert.match(notice.subject, /Website project requirements/);
  assert.match(notice.text, /\+1 555 0100/);
  assert.match(notice.text, /50,000 EGP/);
  assert.match(notice.text, /What they ticked \(3\)/);
  assert.match(notice.text, /- Contact form/);
  assert.match(notice.text, /- WhatsApp button/);
  assert.match(notice.text, /A booking site with payments/, 'the description is one line');
  assert.match(notice.text, /https:\/\/app\.example/);
});

test('an untouched form still produces a readable notice', () => {
  const notice = notify.buildSubmissionNotice({
    request: { type: 'mobile', submittedAt: new Date().toISOString() },
    origin: 'https://app.example'
  });

  assert.match(notice.subject, /A customer \(Mobile app requirements\)/);
  assert.match(notice.text, /- nothing ticked/);
  assert.match(notice.text, /Shared by: unknown/);
});

test('the admin and the agent who shared the form both hear about it', async () => {
  await withEnv('REQUIREMENTS_NOTIFY_EMAIL', undefined, () =>
    withEnv('ADMIN_EMAIL', 'Owner@Example.com', () => {
      assert.deepEqual(notify.recipients(request), ['owner@example.com', 'seif@example.com']);
    })
  );
});

test('one person is never emailed twice', async () => {
  await withEnv('REQUIREMENTS_NOTIFY_EMAIL', undefined, () =>
    withEnv('ADMIN_EMAIL', 'seif@example.com', () => {
      assert.deepEqual(notify.recipients({ agentEmail: 'Seif@Example.com' }), ['seif@example.com']);
    })
  );
});

test('a dedicated notification address wins over the admin address', async () => {
  await withEnv('REQUIREMENTS_NOTIFY_EMAIL', 'forms@example.com', () =>
    withEnv('ADMIN_EMAIL', 'owner@example.com', () => {
      assert.deepEqual(notify.recipients({ agentEmail: '' }), ['forms@example.com']);
    })
  );
});

test('no configured recipient means nothing is sent', async () => {
  await withEnv('REQUIREMENTS_NOTIFY_EMAIL', undefined, () =>
    withEnv('ADMIN_EMAIL', undefined, async () => {
      const outcome = await notify.notifySubmission({
        request: { ...request, agentEmail: '' },
        origin: 'https://app.example'
      });
      assert.deepEqual(outcome, { sent: false, reason: 'no-recipient' });
    })
  );
});
