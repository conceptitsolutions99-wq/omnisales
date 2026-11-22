// The three markets the team sells into, each with areas spread across the whole country. A
// fetch takes the next few areas from each country and advances the cursor, so repeated searches
// sweep the country instead of returning the same city every time.
export const LEAD_MARKETS = [
  {
    country: 'Canada',
    areas: [
      'Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg',
      'Halifax', 'Quebec City', 'Victoria', 'Saskatoon', 'Regina', "St. John's", 'Kelowna', 'London'
    ]
  },
  {
    country: 'USA',
    areas: [
      'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'Dallas',
      'Miami', 'Atlanta', 'Seattle', 'Denver', 'Boston', 'Detroit', 'Minneapolis', 'San Diego',
      'Tampa', 'Las Vegas', 'Nashville'
    ]
  },
  {
    country: 'Egypt',
    // Checked against the live provider: Mansoura, Sohag and Minya returned no contactable
    // listings, so the sweep uses these instead
    areas: [
      'Cairo', 'Alexandria', 'Giza', 'Port Said', 'Suez', 'Luxor', 'Aswan', 'Tanta',
      'Ismailia', 'Hurghada', 'Sharm El Sheikh', 'Damietta', '6th of October City',
      'New Cairo', '10th of Ramadan City'
    ]
  }
];

// Two areas per country per fetch keeps one click cheap while still spreading the results
export const AREAS_PER_SEARCH = 2;

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

// The areas one fetch should search, taken from where the last fetch stopped. Areas are
// interleaved by position, so a click returns one area of each country before a second area of
// any of them. The returned cursors are what the caller saves for the next click.
export const planAreaSearch = (countries, cursors = {}, perCountry = AREAS_PER_SEARCH) => {
  const wanted = new Set(countries);
  const chosen = LEAD_MARKETS.filter((market) => wanted.has(market.country)).map((market) => {
    const start = Number(cursors[market.country] || 0) % market.areas.length;
    const areas = [];
    for (let step = 0; step < perCountry; step += 1) {
      areas.push(market.areas[(start + step) % market.areas.length]);
    }
    return { country: market.country, areas, nextOffset: (start + perCountry) % market.areas.length };
  });

  const markets = [];
  for (let position = 0; position < perCountry; position += 1) {
    for (const entry of chosen) {
      if (entry.areas[position]) markets.push({ country: entry.country, city: entry.areas[position] });
    }
  }

  const nextCursors = { ...cursors };
  for (const entry of chosen) nextCursors[entry.country] = entry.nextOffset;

  return { markets, nextCursors };
};
