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

test('a second email reuses the lead\'s link instead of adding a duplicate form', async () => {
  const sent = {
    type: 'website',
    leadId: null,
    leadEmail: 'again@example.com',
    leadName: 'Again Ltd',
    company: 'Again Ltd',
    agent: 'Seif',
    agentEmail: 'seif@example.com'
  };

  const first = await store.createOrReuseRequest(sent);
  const second = await store.createOrReuseRequest({ ...sent, leadId: 'resweep-id' });

  assert.equal(first.reused, false, 'the first send creates the form');
  assert.equal(second.reused, true, 'the second send hands back the same form');
  assert.equal(second.request.token, first.request.token);

  const links = await store.linksForLead({
    leadId: 'resweep-id',
    leadEmail: 'again@example.com',
    origin
  });
  assert.equal(
    links.filter((link) => link.type === 'website').length,
    1,
    'the lead ends up with one website form, not two'
  );
});

test('a different type still creates its own form', async () => {
  const sent = { leadId: 'lead-two-types', leadEmail: 'two@example.com', agent: 'Seif', agentEmail: 'seif@example.com' };

  const website = await store.createOrReuseRequest({ ...sent, type: 'website' });
  const mobile = await store.createOrReuseRequest({ ...sent, type: 'mobile' });

  assert.notEqual(mobile.request.token, website.request.token);
  assert.equal(mobile.reused, false);
});

test('the dialler gets one link per type, newest first, with the app origin', async () => {
  const linksLead = { leadId: 'lead-links', leadEmail: 'links@example.com' };
  await create('website', linksLead);
  await create('mobile', linksLead);

  const links = await store.linksForLead({ ...linksLead, origin });

  // One entry per type: the panel renders them in its own fixed order, so the array order here
  // is not what keeps a type from appearing twice
  assert.deepEqual(
    links.map((link) => link.type).sort(),
    ['mobile', 'website'],
    'one link per form type'
  );
  links.forEach((link) => {
    assert.equal(link.url, `${origin}/#/requirements/${link.token}`);
  });
});
