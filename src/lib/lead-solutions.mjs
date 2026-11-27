// The offers the team sells, in the order the filters and the rows offer them
export const SOLUTION_OPTIONS = ['Website', 'Web Portal', 'Mobile App'];

export const solutionOf = (lead) => String(lead?.solution || '').trim();

// A lead swept from the map arrives with no interest recorded, so it is a candidate for every
// offer. Once the team tags it, it answers for that offer only — which is what lets the filter
// narrow the list instead of returning every untagged business alongside the matches.
// Tagging from the list is an edit, not a discovery, so it carries a timestamp: the shared store
// lets the newest edit win and a browser that has not synced yet cannot untag the lead with its
// stale copy.
export const tagSolution = (lead, solution, by = '') => ({
  ...lead,
  solution: SOLUTION_OPTIONS.includes(solution) ? solution : '',
  solutionAt: new Date().toISOString(),
  solutionBy: by
});

export const matchesSolution = (lead, filter) => {
  if (!filter || filter === 'All') return true;
  const interest = solutionOf(lead);
  return !interest || interest === filter;
};
