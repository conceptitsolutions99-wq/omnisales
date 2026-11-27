// A mixed fetch sweeps areas spread across each country and merges the answers. The mix has to be
// visible from the first rows, the same business must not be added twice, and the sweep has to
// reach every area of every country before it starts over.
const test = require('node:test');
const assert = require('node:assert/strict');

const markets = () => import('../src/lib/lead-markets.mjs');

// The lead form suggests the region from the same lists the sweep walks, so an area an agent picks
// is one that was actually checked against the provider.
test('each country offers the areas the sweep searches', async () => {
  const { LEAD_MARKETS, areasFor } = await markets();

  for (const market of LEAD_MARKETS) {
    const areas = areasFor(market.country);
    assert.ok(areas.length >= 10, `${market.country} has enough areas to suggest`);
    assert.deepEqual(areas, market.areas, `${market.country} suggests the sweep's own areas`);
    // A copy, so a caller cannot edit the market by sorting or pushing its suggestions
    assert.notEqual(areas, market.areas);
  }

  assert.equal(areasFor('Egypt')[0], 'Cairo');
  assert.ok(areasFor('Egypt').includes('Alexandria'));
  assert.deepEqual(areasFor('Nowhere'), []);
});

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

test('a country with no leads is swept on to its next area, a country with leads is not', async () => {
  const { planEmptyMarketNextArea, LEAD_MARKETS } = await markets();
  const reports = [
    { country: 'Canada', city: 'Toronto', count: 3 },
    { country: 'Egypt', city: 'Cairo', count: 0 },
    { country: 'Egypt', city: 'Alexandria', count: 0 },
    { country: 'USA', city: 'New York', count: 0 }
  ];

  const plan = planEmptyMarketNextArea(reports, ['Canada', 'USA', 'Egypt'], { Canada: [0, 1], USA: [0, 1], Egypt: [0, 1] });

  assert.deepEqual(plan.markets.map((market) => market.country).sort(), ['Egypt', 'USA']);
  const areasOf = (country) => LEAD_MARKETS.find((market) => market.country === country).areas;
  assert.equal(plan.markets.find((market) => market.country === 'Egypt').city, areasOf('Egypt')[2]);
  assert.equal(plan.markets.find((market) => market.country === 'USA').city, areasOf('USA')[2]);
  assert.deepEqual(plan.nextCursors.Egypt, [0, 1, 2]);
  assert.deepEqual(plan.nextCursors.USA, [0, 1, 2]);
  assert.deepEqual(plan.nextCursors.Canada, [0, 1]);
  assert.equal(plan.tried.Egypt, 1);
  // The message names the areas that came back empty, not the ones about to be tried
  assert.deepEqual(plan.emptyAreas.sort(), ['Alexandria', 'Cairo', 'New York']);
});

test('one click tries a bounded number of extra areas per country', async () => {
  const { planEmptyMarketNextArea } = await markets();
  const reports = [{ country: 'Egypt', city: 'Cairo', count: 0 }];

  let cursors = { Egypt: [0, 1] };
  let tried = {};
  let rounds = 0;
  for (;;) {
    const plan = planEmptyMarketNextArea(reports, ['Egypt'], cursors, tried);
    if (plan.markets.length === 0) break;
    rounds += 1;
    cursors = plan.nextCursors;
    tried = plan.tried;
  }

  assert.equal(rounds, 2);
  // Each extra area is a new one, so the retry sweeps the country instead of repeating itself
  assert.deepEqual(cursors.Egypt, [0, 1, 2, 3]);
});

test('a market that is already fully saved still gets another area', async () => {
  const { planEmptyMarketNextArea } = await markets();
  const reports = [{ country: 'Canada', city: 'Toronto', count: 0, allKnown: true }];
  const plan = planEmptyMarketNextArea(reports, ['Canada'], { Canada: [0, 1] });

  assert.equal(plan.markets.length, 1);
  assert.equal(plan.markets[0].country, 'Canada');
});

test('each country carries a spread of cities and smaller regions', async () => {
  const { LEAD_MARKETS } = await markets();
  assert.deepEqual(LEAD_MARKETS.map((market) => market.country), ['Canada', 'USA', 'Egypt']);
  for (const market of LEAD_MARKETS) {
    assert.ok(market.areas.length >= 25, `${market.country} has ${market.areas.length} areas`);
    assert.equal(new Set(market.areas).size, market.areas.length, `${market.country} areas are unique`);
  }
});
