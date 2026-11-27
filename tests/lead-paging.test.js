// The leads table pages its list ten at a time, oldest first, and select-all covers only the page
// on screen. These tests pin the arithmetic: an off-by-one hides rows, and a selection that
// reaches past the page is how a bulk delete removes leads the agent never saw.
const test = require('node:test');
const assert = require('node:assert/strict');

const paging = () => import('../src/lib/lead-paging.mjs');

const lead = (id, createdAt) => ({ id, name: `Lead ${id}`, createdAt });

test('ten leads a page, and a short last page still counts', async () => {
  const { LEADS_PER_PAGE, pageCountFor, pageSlice } = await paging();
  assert.equal(LEADS_PER_PAGE, 10);

  const leads = Array.from({ length: 21 }, (_, index) => lead(index + 1));
  assert.equal(pageCountFor(leads.length), 3);
  assert.equal(pageSlice(leads, 1).length, 10);
  assert.equal(pageSlice(leads, 3).length, 1);
  assert.deepEqual(pageSlice(leads, 3).map((row) => row.id), [21]);

  // An empty list is still one page, so the table can render its "no leads" row
  assert.equal(pageCountFor(0), 1);
  assert.deepEqual(pageSlice([], 1), []);
});

test('the list is ordered oldest first however it arrived', async () => {
  const { sortOldestFirst } = await paging();

  const newestFirst = [
    lead(3, '2026-03-03'),
    lead(1, '2026-01-01'),
    lead(4, '2026-03-04'),
    lead(2, '2026-02-02')
  ];

  assert.deepEqual(sortOldestFirst(newestFirst).map((row) => row.id), [1, 2, 3, 4]);
  // The caller's array is left as it was
  assert.deepEqual(newestFirst.map((row) => row.id), [3, 1, 4, 2]);
});

test('a lead without a date is placed by the timestamp in its id', async () => {
  const { sortOldestFirst } = await paging();

  const leads = [lead(1750000002000), lead(2, '2025-06-01'), lead(1750000001000)];
  assert.deepEqual(sortOldestFirst(leads).map((row) => row.id), [2, 1750000001000, 1750000002000]);
});

test('a shrunken list clamps the page instead of showing an empty table', async () => {
  const { clampPage, pageSlice, pageCountFor } = await paging();

  const leads = Array.from({ length: 12 }, (_, index) => lead(index + 1));
  assert.equal(pageCountFor(leads.length), 2);

  // The agent was on page 4 of a long list, then a filter left twelve rows
  assert.equal(clampPage(4, 2), 2);
  assert.deepEqual(pageSlice(leads, 4).map((row) => row.id), [11, 12]);
  assert.deepEqual(pageSlice(leads, 0).map((row) => row.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(clampPage(1, 1), 1);
});

test('the position line follows the page on screen', async () => {
  const { pageRange } = await paging();

  assert.deepEqual(pageRange(70, 1), { first: 1, last: 10 });
  assert.deepEqual(pageRange(70, 7), { first: 61, last: 70 });
  // Page 9 of a list that is now 12 long shows the real rows, not 81–90
  assert.deepEqual(pageRange(12, 9), { first: 11, last: 12 });
  assert.deepEqual(pageRange(0, 1), { first: 0, last: 0 });
});

test('page numbers keep the ends and the pages around the current one', async () => {
  const { pageNumbersFor } = await paging();

  // Only the first, the last and the two pages either side of the current one are spelled out
  assert.deepEqual(pageNumbersFor(7, 1), [1, 2, 3, '…', 7]);
  assert.deepEqual(pageNumbersFor(1, 1), [1]);
  assert.deepEqual(pageNumbersFor(20, 1), [1, 2, 3, '…', 20]);
  assert.deepEqual(pageNumbersFor(20, 10), [1, '…', 8, 9, 10, 11, 12, '…', 20]);
  assert.deepEqual(pageNumbersFor(20, 20), [1, '…', 18, 19, 20]);
});

test('select-all covers only the page on screen', async () => {
  const { togglePageSelection, isPageSelected } = await paging();

  const pageOne = Array.from({ length: 10 }, (_, index) => lead(index + 1));
  const pageTwo = Array.from({ length: 10 }, (_, index) => lead(index + 11));

  const afterFirstClick = togglePageSelection(pageOne, []);
  assert.deepEqual(afterFirstClick, pageOne.map((row) => String(row.id)));
  assert.equal(isPageSelected(pageOne, afterFirstClick), true);
  assert.equal(isPageSelected(pageTwo, afterFirstClick), false, 'page 2 was never in the selection');

  // Selecting page 2 keeps page 1 selected
  const bothPages = togglePageSelection(pageTwo, afterFirstClick);
  assert.equal(bothPages.length, 20);

  // Clicking page 1 again clears only page 1
  const cleared = togglePageSelection(pageOne, bothPages);
  assert.deepEqual(cleared, pageTwo.map((row) => String(row.id)));

  // A partially selected page completes rather than clearing, keeping the earlier selection
  const partial = togglePageSelection(pageOne, ['1', '3']);
  assert.deepEqual(
    [...partial].sort(),
    pageOne.map((row) => String(row.id)).sort()
  );
  assert.equal(partial.length, 10);

  // An empty page (no rows to select) leaves the selection alone
  assert.deepEqual(togglePageSelection([], ['1']), ['1']);
});
