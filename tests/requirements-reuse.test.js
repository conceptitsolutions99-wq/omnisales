// A lead must never end up with two forms for the same project. The dialler asks what the lead
// already has, and the create path hands back that form instead of minting a second one; only a
// type the lead has none of produces a new link.
process.env.DATABASE_URL = '';

const test = require('node:test');
const assert = require('node:assert/strict');

const store = require('../lib/requirements-store');

const origin = 'https://omnisales-delta.vercel.app';
const create = (type, overrides = {}) =>
  store.createRequest({
    type,
    leadId: 'lead-1',
    leadEmail: 'Buyer@Example.com',
    leadName: 'Aitken Legal',
    company: 'Aitken Legal',
    agent: 'Seif',
    agentEmail: 'seif@example.com',
    ...overrides
  });

test('the form a lead was sent is found for its own type only', async () => {
  const sent = await create('website', { leadId: 'lead-website' });

  const found = await store.findForLead({ leadId: 'lead-website', leadEmail: '', type: 'website' });
  assert.equal(found?.token, sent.token, 'the website form comes back');
  assert.equal(
    await store.findForLead({ leadId: 'lead-website', leadEmail: '', type: 'mobile' }),
    null,
    'the lead has no mobile form yet'
  );
});

test('the same address still matches after the lead record was replaced by a new id', async () => {
  const sent = await create('desktop', { leadId: 'lead-before-resweep' });

  const found = await store.findForLead({
    leadId: 'lead-after-resweep',
    leadEmail: 'buyer@example.com',
    type: 'desktop'
  });
  assert.equal(found?.token, sent.token, 'a fresh search hit reuses the form already sent');
});

test('a different lead never matches', async () => {
  await create('mobile', { leadId: 'lead-mobile' });

  assert.equal(
    await store.findForLead({ leadId: 'someone-else', leadEmail: 'other@example.com', type: 'mobile' }),
    null
  );
});

test('an unknown form type is never reused', async () => {
  assert.equal(await store.findForLead({ leadId: 'lead-website', leadEmail: '', type: 'poster' }), null);
});

test('a lead with no id and no address does not match every form', async () => {
  await create('website', { leadId: 'lead-guard' });

  assert.equal(await store.findForLead({ leadId: null, leadEmail: '', type: 'website' }), null);
});

test('the dialler gets one link per type, newest first, with the app origin', async () => {
  const linksLead = { leadId: 'lead-links', leadEmail: 'links@example.com' };
  await create('website', linksLead);
  await create('mobile', linksLead);

  const links = await store.linksForLead({ ...linksLead, origin });

  assert.deepEqual(
    links.map((link) => link.type),
    ['mobile', 'website'],
    'one link per form type'
  );
  links.forEach((link) => {
    assert.equal(link.url, `${origin}/#/requirements/${link.token}`);
  });
});
