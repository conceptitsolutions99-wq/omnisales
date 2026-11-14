// Vercel serverless function: real business leads from OpenStreetMap's Overpass API.
// Free and key-less. Data © OpenStreetMap contributors, ODbL licence.
//
// Vercel's Hobby plan allows ~10 seconds per function, so the whole search is
// bounded by one deadline instead of long retry sleeps.

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter'
];

const REQUEST_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'ConceptITSolutions-Outbound/1.0'
};

const BUDGET_MS = 8500;

// Each category maps to OSM selectors that require a published phone number
const LEAD_CATEGORIES = {
  offices: ['nwr["office"]["phone"]', 'nwr["office"]["contact:phone"]'],
  professional: [
    'nwr["office"~"^(lawyer|accountant|insurance|estate_agent|financial|it|company|consulting)$"]["phone"]',
    'nwr["office"~"^(lawyer|accountant|insurance|estate_agent|financial|it|company|consulting)$"]["contact:phone"]'
  ],
  retail: ['nwr["shop"]["phone"]', 'nwr["shop"]["contact:phone"]'],
  food: [
    'nwr["amenity"~"^(restaurant|cafe|bar|fast_food|bakery|pub)$"]["phone"]',
    'nwr["amenity"~"^(restaurant|cafe|bar|fast_food|bakery|pub)$"]["contact:phone"]'
  ],
  health: [
    'nwr["amenity"~"^(dentist|clinic|doctors|pharmacy|veterinary)$"]["phone"]',
    'nwr["amenity"~"^(dentist|clinic|doctors|pharmacy|veterinary)$"]["contact:phone"]'
  ],
  trades: [
    'nwr["craft"]["phone"]',
    'nwr["shop"~"^(car_repair|doityourself|hardware|electrical)$"]["phone"]',
    'nwr["shop"~"^(car_repair|doityourself|hardware|electrical)$"]["contact:phone"]'
  ]
};

const buildOverpassQuery = (city, category, limit) => {
  const selectors = LEAD_CATEGORIES[category] || LEAD_CATEGORIES.offices;
  const safeCity = city.replace(/["\\]/g, '');
  return `[out:json][timeout:8];
area["name"="${safeCity}"]["boundary"="administrative"]->.a;
(
  ${selectors.map((selector) => `${selector}(area.a);`).join('\n  ')}
);
out tags center ${limit};`;
};

const mapLead = (element, fallbackCity, country) => {
  const tags = element.tags || {};
  const rawPhone = tags.phone || tags['contact:phone'] || '';
  const name = tags.name || tags['operator'];
  if (!name || !rawPhone) return null;

  const website = tags.website || tags['contact:website'] || '';
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const city = tags['addr:city'] || fallbackCity;

  return {
    id: `osm-${element.type}-${element.id}`,
    name,
    company: name,
    phone: rawPhone.replace(/[^+\d]/g, ''),
    displayPhone: rawPhone,
    email: tags.email || tags['contact:email'] || '',
    website,
    address: [street, city].filter(Boolean).join(', '),
    country,
    region: city,
    size: 'Unknown',
    solution: '',
    status: 'New',
    value: 0,
    notes: `Real OpenStreetMap listing${website ? ' · website on file' : ' · no website listed'}`,
    createdAt: new Date().toISOString().split('T')[0],
    lat: element.lat ?? element.center?.lat ?? null,
    lon: element.lon ?? element.center?.lon ?? null
  };
};

const queryOverpass = async (query) => {
  const deadline = Date.now() + BUDGET_MS;
  let lastError = 'The map data service could not be reached.';

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const remaining = deadline - Date.now();
    if (remaining < 1200) break;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(remaining, 7000));

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
      });
      clearTimeout(timer);

      if ([429, 502, 503, 504].includes(response.status)) {
        lastError = 'The map service is busy right now. Please try again in a minute.';
        continue;
      }
      if (!response.ok) {
        lastError = `The map data service returned ${response.status}.`;
        continue;
      }

      return await response.json();
    } catch (err) {
      lastError = err.name === 'AbortError' ? 'The map data service timed out. Try a smaller city or try again shortly.' : err.message;
    }
  }

  throw new Error(lastError);
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Use GET.' });
  }

  const city = String(req.query.city || '').trim();
  const category = String(req.query.category || 'offices').toLowerCase();
  const country = String(req.query.country || '').trim();
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 25;

  if (city.length < 2) {
    return res.status(400).json({ error: 'Enter a city or region to search.' });
  }

  try {
    const payload = await queryOverpass(buildOverpassQuery(city, category, limit));
    const elements = Array.isArray(payload.elements) ? payload.elements : [];
    const leads = elements.map((element) => mapLead(element, city, country)).filter(Boolean);

    return res.status(200).json({
      ok: true,
      count: leads.length,
      source: 'OpenStreetMap',
      attribution: '© OpenStreetMap contributors',
      leads
    });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};
