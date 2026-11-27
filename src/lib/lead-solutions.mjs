// The offers the team sells, in the order the filters and the rows offer them
export const SOLUTION_OPTIONS = ['Website', 'Web Portal', 'Mobile App'];

export const solutionOf = (lead) => String(lead?.solution || '').trim();

// How each offer is named in copy: the noun for "a mobile app" and the plural for "mobile apps"
const OFFERS = {
  Website: { key: 'website', noun: 'website', plural: 'websites' },
  'Web Portal': { key: 'web-portal', noun: 'web portal', plural: 'web portals' },
  'Mobile App': { key: 'mobile-app', noun: 'mobile app', plural: 'mobile apps' }
};

// The line the outreach copy can use whatever the lead is tagged with
const OFFER_PLURALS = SOLUTION_OPTIONS.map((option) => OFFERS[option].plural);
export const OFFER_CATALOGUE = `${OFFER_PLURALS.slice(0, -1).join(', ')} and ${OFFER_PLURALS[OFFER_PLURALS.length - 1]}`;

// The offer a lead is being sold, in the words the templates use. An untagged lead is not
// quietly treated as a website: until the team tags it, the copy names what the team sells
// rather than putting words in the customer's mouth.
export const offerFor = (lead) => {
  const label = solutionOf(lead);
  const offer = OFFERS[label];
  if (!offer) {
    return { key: 'untagged', label: '', tagged: false, noun: 'website or app', plural: 'websites and apps' };
  }
  return { ...offer, label, tagged: true };
};

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
