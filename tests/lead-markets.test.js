// A mixed fetch sweeps areas spread across each country and merges the answers. The mix has to be
// visible from the first rows, the same business must not be added twice, and the sweep has to
// keep moving so repeated searches do not land in the same city.
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

test('a fetch sweeps two areas from each country, interleaved', async () => {
  const { planAreaSearch, LEAD_MARKETS } = await markets();
  const plan = planAreaSearch(['Canada', 'USA', 'Egypt'], {});

  assert.deepEqual(plan.markets.map((market) => market.country), [
    'Canada', 'USA', 'Egypt', 'Canada', 'USA', 'Egypt'
  ]);
  for (const market of LEAD_MARKETS) {
    const areas = market.areas;
    assert.deepEqual(
      plan.markets.filter((entry) => entry.country === market.country).map((entry) => entry.city),
      [areas[0], areas[1]]
    );
    assert.equal(plan.nextCursors[market.country], 2);
  }
});

test('picking one country sweeps only that country and keeps its own cursor', async () => {
  const { planAreaSearch, LEAD_MARKETS } = await markets();
  const usa = LEAD_MARKETS.find((market) => market.country === 'USA').areas;
  const plan = planAreaSearch(['USA'], { USA: 4, Canada: 9 });

  assert.deepEqual(plan.markets.map((market) => market.city), [usa[4], usa[5]]);
  assert.equal(plan.nextCursors.USA, 6);
  assert.equal(plan.nextCursors.Canada, 9);
});

test('the sweep wraps around the area list', async () => {
  const { planAreaSearch, LEAD_MARKETS } = await markets();
  const egypt = LEAD_MARKETS.find((market) => market.country === 'Egypt').areas;
  const plan = planAreaSearch(['Egypt'], { Egypt: egypt.length - 1 });

  assert.deepEqual(plan.markets.map((market) => market.city), [egypt[egypt.length - 1], egypt[0]]);
  assert.equal(plan.nextCursors.Egypt, 1);
});

test('each country carries a spread of areas, not one city', async () => {
  const { LEAD_MARKETS } = await markets();
  assert.deepEqual(LEAD_MARKETS.map((market) => market.country), ['Canada', 'USA', 'Egypt']);
  for (const market of LEAD_MARKETS) assert.ok(market.areas.length >= 10, `${market.country} areas`);
});
