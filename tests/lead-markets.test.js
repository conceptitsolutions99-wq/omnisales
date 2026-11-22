// A mixed fetch searches one city per market and merges the answers. The mix has to be visible
// from the first rows, and the same business found twice must not be added twice.
const test = require('node:test');
const assert = require('node:assert/strict');

const markets = () => import('../src/lib/lead-markets.mjs');

test('every market is represented before a second row from any of them', async () => {
  const { mixLeads } = await markets();
  const canada = [{ id: 'c1', phone: '+14165550001' }, { id: 'c2', phone: '+14165550002' }];
  const usa = [{ id: 'u1', phone: '+12125550001' }, { id: 'u2', phone: '+12125550002' }];
  const egypt = [{ id: 'e1', phone: '+201000000001' }, { id: 'e2', phone: '+201000000002' }];

  assert.deepEqual(
    mixLeads([canada, usa, egypt]).map((lead) => lead.id),
    ['c1', 'u1', 'e1', 'c2', 'u2', 'e2']
  );
});

test('a shorter market does not leave gaps, and empty markets are skipped', async () => {
  const { mixLeads } = await markets();
  const canada = [{ id: 'c1' }, { id: 'c2' }];
  const usa = [{ id: 'u1' }];
  const egypt = [];

  assert.deepEqual(mixLeads([canada, usa, egypt]).map((lead) => lead.id), ['c1', 'u1', 'c2']);
  assert.deepEqual(mixLeads([]), []);
  assert.deepEqual(mixLeads([undefined, null]), []);
});

test('the same business is kept once, by id or by phone', async () => {
  const { mixLeads } = await markets();
  const canada = [{ id: 'same-id', phone: '+14165550001' }, { id: 'c2', phone: '+1 416 555 0002' }];
  const usa = [
    { id: 'same-id', phone: '+12125550001' },
    { id: 'u2', phone: '(416) 555-0002' },
    { id: 'u3', phone: '+12125550003' }
  ];

  assert.deepEqual(mixLeads([canada, usa]).map((lead) => lead.id), ['same-id', 'c2', 'u3']);
});

test('the three markets cover Canada, the USA and Egypt', async () => {
  const { LEAD_MARKETS } = await markets();
  assert.deepEqual(LEAD_MARKETS.map((market) => market.country), ['Canada', 'USA', 'Egypt']);
  assert.deepEqual(LEAD_MARKETS.map((market) => market.city), ['Toronto', 'New York', 'Cairo']);
});
