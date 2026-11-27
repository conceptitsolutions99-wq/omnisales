// The IT Solutions filter only narrows the list when leads carry an offer. An untagged lead is a
// candidate for every offer; a tagged one answers for its own offer alone.
const test = require('node:test');
const assert = require('node:assert/strict');

const solutions = () => import('../src/lib/lead-solutions.mjs');

test('the offers are the three the team sells', async () => {
  const { SOLUTION_OPTIONS } = await solutions();
  assert.deepEqual(SOLUTION_OPTIONS, ['Website', 'Web Portal', 'Mobile App']);
});

test('an untagged lead is a candidate for every offer', async () => {
  const { matchesSolution } = await solutions();

  for (const filter of ['Website', 'Web Portal', 'Mobile App', 'All']) {
    assert.equal(matchesSolution({ solution: '' }, filter), true, `untagged matches ${filter}`);
    assert.equal(matchesSolution({}, filter), true, 'a lead with no solution key matches too');
  }
});

test('a tagged lead matches its own offer and nothing else', async () => {
  const { matchesSolution } = await solutions();

  const lead = { solution: 'Web Portal' };
  assert.equal(matchesSolution(lead, 'Web Portal'), true);
  assert.equal(matchesSolution(lead, 'Website'), false);
  assert.equal(matchesSolution(lead, 'Mobile App'), false);
  assert.equal(matchesSolution(lead, 'All'), true);
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
  assert.equal(matchesSolution({ solution: '   ' }, 'Website'), true);

  // A tag that reached us with padding still answers for its own offer
  assert.equal(solutionOf({ solution: ' Website ' }), 'Website');
  assert.equal(matchesSolution({ solution: ' Website ' }, 'Website'), true);
  assert.equal(matchesSolution({ solution: ' Website ' }, 'Mobile App'), false);
});
