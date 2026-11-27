// The three markets the team sells into, each with cities and smaller regions spread across the
// whole country. A fetch takes the next few areas from each country and records them, so repeated
// searches sweep the country instead of returning the same city every time.
//
// Every area below was checked against the live provider; places that returned no contactable
// listings (Mansoura, Sohag, Minya, Beni Suef, Qena, Sheikh Zayed City) are deliberately absent.
export const LEAD_MARKETS = [
  {
    country: 'Canada',
    areas: [
      'Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg',
      'Halifax', 'Quebec City', 'Victoria', 'Saskatoon', 'Regina', "St. John's", 'Kelowna', 'London',
      'Mississauga', 'Brampton', 'Scarborough', 'North York', 'Etobicoke', 'Markham', 'Vaughan',
      'Hamilton', 'Kitchener', 'Windsor', 'Laval', 'Gatineau', 'Surrey', 'Burnaby', 'Richmond'
    ]
  },
  {
    country: 'USA',
    areas: [
      'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'Dallas',
      'Miami', 'Atlanta', 'Seattle', 'Denver', 'Boston', 'Detroit', 'Minneapolis', 'San Diego',
      'Tampa', 'Las Vegas', 'Nashville', 'Brooklyn', 'Queens', 'Bronx', 'Jersey City', 'Newark',
      'Oakland', 'San Jose', 'Long Beach', 'Anaheim', 'Fort Worth', 'Plano', 'Austin',
      'San Antonio', 'Charlotte', 'Pittsburgh', 'Portland'
    ]
  },
  {
    country: 'Egypt',
    areas: [
      'Cairo', 'Alexandria', 'Giza', 'Port Said', 'Suez', 'Luxor', 'Aswan', 'Tanta',
      'Ismailia', 'Hurghada', 'Sharm El Sheikh', 'Damietta', '6th of October City',
      'New Cairo', '10th of Ramadan City', 'Nasr City', 'Maadi', 'Heliopolis', 'Mohandessin',
      'Dokki', 'Zamalek', 'Shubra El Kheima', 'Zagazig', 'Damanhour', 'Banha', 'Fayoum',
      'Asyut', 'Obour City'
    ]
  }
];

// The areas one country covers, in the order the sweep visits them. The lead form offers these as
// suggestions for its region field, so an area typed by an agent is one the sweep can search too.
export const areasFor = (country) => {
  const market = LEAD_MARKETS.find((entry) => entry.country === country);
  return market ? [...market.areas] : [];
};

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

// The cursor remembers which areas a country has already searched in the current cycle. An index
// list, not an offset, is what guarantees every area is reached: stepping by two through an
// even-length list would only ever visit even indices and silently skip half the country.
const visitedIn = (value, total) => {
  if (Array.isArray(value)) {
    return [...new Set(
      value
        .map(Number)
        .filter((index) => Number.isInteger(index) && index >= 0 && index < total)
    )];
  }
  // An older cursor was a plain offset, so keep its progress instead of restarting the country
  const offset = Number(value);
  if (Number.isInteger(offset) && offset > 0) {
    return Array.from({ length: Math.min(offset, total) }, (_, index) => index);
  }
  return [];
};

// The next areas to search from one country's list, plus the cursor after them. Exported so the
// coverage guarantee can be tested directly, including on list lengths that do not divide evenly.
export const nextAreas = (areas, cursor, perCountry = AREAS_PER_SEARCH) => {
  const total = areas.length;
  if (total === 0) return { areas: [], nextVisited: [] };

  const visited = visitedIn(cursor, total);
  const unvisited = [];
  for (let index = 0; index < total; index += 1) {
    if (!visited.includes(index)) unvisited.push(index);
  }

  let picked = unvisited.slice(0, perCountry);
  let nextVisited;

  if (picked.length < perCountry) {
    // The cycle is nearly finished: take what is left of it, then begin the next cycle with the
    // first areas so the sweep keeps moving without skipping anything
    const fresh = [];
    for (let index = 0; index < total && fresh.length < perCountry - picked.length; index += 1) {
      fresh.push(index);
    }
    picked = [...picked, ...fresh];
    nextVisited = fresh;
  } else {
    nextVisited = [...visited, ...picked];
  }

  return { areas: picked.map((index) => areas[index]), nextVisited };
};

// The areas one fetch should search, taken from where the last fetch stopped. Areas are
// interleaved by position, so a click returns one area of each country before a second area of
// any of them. The returned cursors are what the caller saves for the next click.
export const planAreaSearch = (countries, cursors = {}, perCountry = AREAS_PER_SEARCH) => {
  const wanted = new Set(countries);
  const nextCursors = { ...cursors };

  const chosen = LEAD_MARKETS.filter((market) => wanted.has(market.country)).map((market) => {
    const { areas, nextVisited } = nextAreas(market.areas, cursors[market.country], perCountry);
    return { country: market.country, areas, nextVisited };
  });

  for (const entry of chosen) nextCursors[entry.country] = entry.nextVisited;

  const markets = [];
  for (let position = 0; position < perCountry; position += 1) {
    for (const entry of chosen) {
      if (entry.areas[position]) markets.push({ country: entry.country, city: entry.areas[position] });
    }
  }

  return { markets, nextCursors };
};

// An area can come back with nothing contactable: thin map coverage, a mirror with a gap, or a
// district the provider does not index. One such area would make its whole country look dead for
// that click, so the sweep moves on to the next area of that country. Two extra areas are enough
// to get past a gap without turning one click into a long crawl.
export const MAX_EXTRA_AREAS = 2;

// The areas a sweep should try next, for the countries that produced no leads at all. A country
// with even one lead is left alone, because its market is not empty. `tried` counts the extra
// areas already spent on each country, so one click cannot sweep forever.
export const planEmptyMarketNextArea = (reports, countries, cursors = {}, tried = {}, maxExtra = MAX_EXTRA_AREAS) => {
  const empty = countries.filter((country) => {
    const own = (reports || []).filter((report) => report.country === country);
    if (own.length === 0) return false;
    if (own.some((report) => report.count > 0)) return false;
    return (tried[country] || 0) < maxExtra;
  });

  if (empty.length === 0) return { markets: [], nextCursors: cursors, tried, emptyAreas: [] };

  const plan = planAreaSearch(empty, cursors, 1);
  const nextTried = { ...tried };
  for (const country of empty) nextTried[country] = (nextTried[country] || 0) + 1;

  // The areas that came back empty, so the message can name them instead of the area it is about
  // to try
  const emptyAreas = [
    ...new Set(
      empty.flatMap((country) =>
        (reports || []).filter((report) => report.country === country).map((report) => report.city)
      )
    )
  ];

  return { markets: plan.markets, nextCursors: plan.nextCursors, tried: nextTried, emptyAreas };
};
