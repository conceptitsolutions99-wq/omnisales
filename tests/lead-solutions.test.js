// The IT Solutions filter only narrows the list when leads carry an offer. An untagged lead is a
// candidate for every offer; a tagged one answers for its own offer alone.
const test = require('node:test');
const assert = require('node:assert/strict');

const solutions = () => import('../src/lib/lead-solutions.mjs');

test('the offers are the three the team sells', async () => {
  const { SOLUTION_OPTIONS } = await solutions();
  assert.deepEqual(SOLUTION_OPTIONS, ['Website', 'Web Portal', 'Mobile App']);
});

test('an untagged lead is listed under No offer tagged yet, not under an offer', async () => {
  const { matchesSolution } = await solutions();

  // The offer filters have to segment the list: the same untagged businesses under every offer
  // would make Website, Web Portal and Mobile App show one identical list.
  for (const filter of ['Website', 'Web Portal', 'Mobile App']) {
    assert.equal(matchesSolution({ solution: '' }, filter), false, `untagged is not under ${filter}`);
    assert.equal(matchesSolution({}, filter), false, 'a lead with no solution key is not either');
  }

  assert.equal(matchesSolution({ solution: '' }, 'Untagged'), true);
  assert.equal(matchesSolution({}, 'Untagged'), true);
  assert.equal(matchesSolution({ solution: 'Website' }, 'Untagged'), false);
  assert.equal(matchesSolution({ solution: '' }, 'All'), true);
  assert.equal(matchesSolution({ solution: 'Website' }, 'All'), true);
});

test('a tagged lead matches its own offer and nothing else', async () => {
  const { matchesSolution } = await solutions();

  const lead = { solution: 'Web Portal' };
  assert.equal(matchesSolution(lead, 'Web Portal'), true);
  assert.equal(matchesSolution(lead, 'Website'), false);
  assert.equal(matchesSolution(lead, 'Mobile App'), false);
  assert.equal(matchesSolution(lead, 'All'), true);
  assert.equal(matchesSolution(lead, 'Untagged'), false, 'a tagged lead is not in the untagged list');
});

test('the outreach copy names the offer the lead is tagged with', async () => {
  const { offerFor, OFFER_CATALOGUE } = await solutions();

  assert.equal(OFFER_CATALOGUE, 'websites, web portals and mobile apps');
  assert.deepEqual(offerFor({ solution: 'Mobile App' }), {
    key: 'mobile-app',
    noun: 'mobile app',
    plural: 'mobile apps',
    label: 'Mobile App',
    tagged: true
  });
  assert.equal(offerFor({ solution: ' Web Portal ' }).noun, 'web portal');
  assert.equal(offerFor({ solution: 'Website' }).noun, 'website');

  // An untagged lead is not quietly sold a website: the copy says what the team actually sells
  const untagged = offerFor({ solution: '' });
  assert.equal(untagged.tagged, false);
  assert.equal(untagged.noun, 'website or app');
  assert.equal(untagged.plural, 'websites and apps');
  assert.notEqual(untagged.noun, 'website');
});

test('tagging a lead stamps the edit and only stores a real offer', async () => {
  const { tagSolution } = await solutions();

  const tagged = tagSolution({ id: 1, solution: '' }, 'Website', 'Sarah');
  assert.equal(tagged.solution, 'Website');
  assert.equal(tagged.solutionBy, 'Sarah');
  assert.ok(!Number.isNaN(Date.parse(tagged.solutionAt)), 'the edit carries a timestamp');

  // Clearing is an edit too; a value that is not one of the offers is treated as a clear
  assert.equal(tagSolution(tagged, '', 'Sarah').solution, '');
  assert.equal(tagSolution(tagged, 'Banner ads', 'Sarah').solution, '');
  assert.equal(tagged.solution, 'Website', 'the lead handed in is not changed');
});

test('a blank or padded solution counts as untagged', async () => {
  const { matchesSolution, solutionOf } = await solutions();

  assert.equal(solutionOf({ solution: '   ' }), '');
  assert.equal(matchesSolution({ solution: '   ' }, 'Website'), false);
  assert.equal(matchesSolution({ solution: '   ' }, 'Untagged'), true);

  // A tag that reached us with padding still answers for its own offer
  assert.equal(solutionOf({ solution: ' Website ' }), 'Website');
  assert.equal(matchesSolution({ solution: ' Website ' }, 'Website'), true);
  assert.equal(matchesSolution({ solution: ' Website ' }, 'Mobile App'), false);
});
