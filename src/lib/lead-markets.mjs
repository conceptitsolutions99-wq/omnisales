// The three markets the team sells into. A single fetch searches one city per market and merges
// the answers, so the list is not all from whichever country the city box happened to name.
export const LEAD_MARKETS = [
  { country: 'Canada', city: 'Toronto' },
  { country: 'USA', city: 'New York' },
  { country: 'Egypt', city: 'Cairo' }
];

// Round-robin, so the first screen already shows all three countries instead of 30 Canadian rows
// followed by the rest. A business found by two markets is kept once: the same id, or the same
// last ten digits of a phone number, is the same lead.
export const mixLeads = (groups = []) => {
  const lists = groups.map((group) => (Array.isArray(group) ? group : []));
  const longest = lists.reduce((max, list) => Math.max(max, list.length), 0);

  const seenIds = new Set();
  const seenPhones = new Set();
  const mixed = [];

  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      const lead = list[index];
      if (!lead || typeof lead !== 'object') continue;

      const id = String(lead.id ?? '');
      const digits = String(lead.phone || '').replace(/\D/g, '');
      const phone = digits.length >= 7 ? digits.slice(-10) : '';

      if ((id && seenIds.has(id)) || (phone && seenPhones.has(phone))) continue;
      if (id) seenIds.add(id);
      if (phone) seenPhones.add(phone);
      mixed.push(lead);
    }
  }

  return mixed;
};
