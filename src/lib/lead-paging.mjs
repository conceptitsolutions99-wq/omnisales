// The shared list is long, so the table shows a page at a time, oldest lead first. The ordering,
// the page arithmetic and the page-scoped selection live here so they can be checked without a
// browser: an off-by-one here hides leads, and a select-all that reaches past the page turns a
// bulk delete into a record loss.

export const LEADS_PER_PAGE = 10;

// A lead's age: its creation date when it has one, otherwise the timestamp in its id
export const leadTime = (lead) => {
  const stamp = Date.parse(lead?.createdAt || '');
  if (!Number.isNaN(stamp)) return stamp;
  const id = Number(lead?.id);
  return Number.isFinite(id) ? id : 0;
};

// Oldest first, so page 1 is the start of the list rather than whatever arrived last
export const sortOldestFirst = (leads = []) => [...leads].sort((a, b) => leadTime(a) - leadTime(b));

export const pageCountFor = (total) => Math.max(1, Math.ceil(Math.max(0, total) / LEADS_PER_PAGE));

// A filter can shrink the list under the page the table is on, and the page follows the list
export const clampPage = (page, pageCount) =>
  Math.min(Math.max(1, Number(page) || 1), Math.max(1, pageCount));

export const pageSlice = (leads = [], page = 1) => {
  const current = clampPage(page, pageCountFor(leads.length));
  return leads.slice((current - 1) * LEADS_PER_PAGE, current * LEADS_PER_PAGE);
};

// The "1–10 of 70" line: the positions of the rows on the page actually on screen
export const pageRange = (total, page = 1) => {
  if (!total) return { first: 0, last: 0 };
  const current = clampPage(page, pageCountFor(total));
  return {
    first: (current - 1) * LEADS_PER_PAGE + 1,
    last: Math.min(current * LEADS_PER_PAGE, total)
  };
};

// A page number for the ends and for the pages around the current one; the gaps become "…"
export const pageNumbersFor = (pageCount, currentPage) => {
  const numbers = [];
  for (let number = 1; number <= pageCount; number += 1) {
    if (number === 1 || number === pageCount || Math.abs(number - currentPage) <= 2) {
      numbers.push(number);
    } else if (numbers[numbers.length - 1] !== '…') {
      numbers.push('…');
    }
  }
  return numbers;
};

export const isPageSelected = (pageLeads = [], selectedIds = []) =>
  pageLeads.length > 0 && pageLeads.every((lead) => selectedIds.includes(String(lead.id)));

// Select-all covers the page on screen: with ten rows a page, silently selecting leads the agent
// cannot see is how a bulk delete takes the wrong records. A click adds the page's ids, and when
// every one of them is already selected it clears the page and leaves the other pages alone.
export const togglePageSelection = (pageLeads = [], selectedIds = []) => {
  const pageIds = pageLeads.map((lead) => String(lead.id));
  if (pageIds.length === 0) return selectedIds;
  if (pageIds.every((id) => selectedIds.includes(id))) {
    return selectedIds.filter((id) => !pageIds.includes(id));
  }
  return [...selectedIds, ...pageIds.filter((id) => !selectedIds.includes(id))];
};
