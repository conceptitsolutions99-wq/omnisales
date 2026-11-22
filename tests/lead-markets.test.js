// A mixed fetch sweeps areas spread across each country and merges the answers. The mix has to be
// visible from the first rows, the same business must not be added twice, and the sweep has to
// reach every area of every country before it starts over.
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
    assert.deepEqual(
      plan.markets.filter((entry) => entry.country === market.country).map((entry) => entry.city),
      [market.areas[0], market.areas[1]]
    );
    assert.deepEqual(plan.nextCursors[market.country], [0, 1]);
  }
});

test('every area is reached before the sweep repeats, even with an even-length list', async () => {
  const { nextAreas } = await markets();

  // Six areas, two per fetch: the old offset cursor stepped 0,2,4 and never saw 1,3,5
  const areas = ['a', 'b', 'c', 'd', 'e', 'f'];
  let cursor = [];
  const seen = [];
  for (let step = 0; step < 3; step += 1) {
    const next = nextAreas(areas, cursor);
    seen.push(...next.areas);
    cursor = next.nextVisited;
  }

  assert.deepEqual([...new Set(seen)].sort(), [...areas].sort());
  assert.equal(seen.length, areas.length);
});

test('an odd-length list is fully covered too, without skipping the tail', async () => {
  const { nextAreas } = await markets();
  const areas = ['a', 'b', 'c', 'd', 'e'];
  let cursor = [];
  const seen = [];
  for (let step = 0; step < 3; step += 1) {
    const next = nextAreas(areas, cursor);
    seen.push(...next.areas);
    cursor = next.nextVisited;
  }

  assert.deepEqual([...new Set(seen)].sort(), [...areas].sort());
  // The last fetch finishes the old cycle and opens the next one, so one area repeats
  assert.equal(seen.length, areas.length + 1);
});

test('a completed cycle starts again from the first area', async () => {
  const { planAreaSearch, LEAD_MARKETS } = await markets();
  const canada = LEAD_MARKETS.find((market) => market.country === 'Canada').areas;
  const plan = planAreaSearch(['Canada'], { Canada: canada.map((_, index) => index) });

  assert.deepEqual(plan.markets.map((market) => market.city), [canada[0], canada[1]]);
  assert.deepEqual(plan.nextCursors.Canada, [0, 1]);
});

test('picking one country sweeps only that country and keeps its own cursor', async () => {
  const { planAreaSearch, LEAD_MARKETS } = await markets();
  const usa = LEAD_MARKETS.find((market) => market.country === 'USA').areas;
  const plan = planAreaSearch(['USA'], { USA: [0, 1, 2, 3], Canada: [9] });

  assert.deepEqual(plan.markets.map((market) => market.city), [usa[4], usa[5]]);
  assert.deepEqual(plan.nextCursors.USA, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(plan.nextCursors.Canada, [9]);
});

test('an older numeric cursor keeps its progress', async () => {
  const { planAreaSearch, LEAD_MARKETS } = await markets();
  const egypt = LEAD_MARKETS.find((market) => market.country === 'Egypt').areas;
  const plan = planAreaSearch(['Egypt'], { Egypt: 2 });

  assert.deepEqual(plan.markets.map((market) => market.city), [egypt[2], egypt[3]]);
  assert.deepEqual(plan.nextCursors.Egypt, [0, 1, 2, 3]);
});

test('every area of every real market is reachable', async () => {
  const { planAreaSearch, LEAD_MARKETS, AREAS_PER_SEARCH } = await markets();

  for (const market of LEAD_MARKETS) {
    const fetches = Math.ceil(market.areas.length / AREAS_PER_SEARCH);
    let cursors = {};
    const seen = [];
    for (let step = 0; step < fetches; step += 1) {
      const plan = planAreaSearch([market.country], cursors);
      seen.push(...plan.markets.map((entry) => entry.city));
      cursors = plan.nextCursors;
    }
    assert.deepEqual(
      [...new Set(seen)].sort(),
      [...market.areas].sort(),
      `${market.country} reaches every area`
    );
  }
});

test('each country carries a spread of cities and smaller regions', async () => {
  const { LEAD_MARKETS } = await markets();
  assert.deepEqual(LEAD_MARKETS.map((market) => market.country), ['Canada', 'USA', 'Egypt']);
  for (const market of LEAD_MARKETS) {
    assert.ok(market.areas.length >= 25, `${market.country} has ${market.areas.length} areas`);
    assert.equal(new Set(market.areas).size, market.areas.length, `${market.country} areas are unique`);
  }
});
