// Real business leads from OpenStreetMap, fetched straight from the browser so a
// static deployment needs no backend for search. Nominatim and Overpass both allow
// cross-origin requests. Data © OpenStreetMap contributors (ODbL).

const JSON_HEADERS = { Accept: 'application/json' };

// osm.ch only carries Swiss data, so it is deliberately excluded
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

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

const fetchWithTimeout = async (url, options = {}, timeoutMs = 7000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

// Resolve the city to a bounding box so matching does not depend on exact OSM names
const geocodeCache = new Map();

const geocodeCity = async (city) => {
  const key = city.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.bbox;

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
  const response = await fetchWithTimeout(url, { headers: JSON_HEADERS }, 10000);
  if (!response.ok) return null;

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) return null;

  const [south, north, west, east] = results[0].boundingbox.map(Number);
  const bbox = { south, west, north, east, label: results[0].display_name };
  geocodeCache.set(key, { at: Date.now(), bbox });
  return bbox;
};

// A bounding-box query is cheaper for the public service than an area lookup
const buildBboxQuery = (bbox, category, limit) => {
  const selectors = LEAD_CATEGORIES[category] || LEAD_CATEGORIES.offices;
  const area = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:20];
(
  ${selectors.map((selector) => `${selector}(${area});`).join('\n  ')}
);
out tags center ${limit};`;
};

// Fallback when geocoding is unavailable: match the administrative area by name
const buildAreaQuery = (city, category, limit) => {
  const selectors = LEAD_CATEGORIES[category] || LEAD_CATEGORIES.offices;
  const safeCity = city.replace(/["\\]/g, '');
  return `[out:json][timeout:20];
area["name"="${safeCity}"]["boundary"="administrative"]->.a;
(
  ${selectors.map((selector) => `${selector}(area.a);`).join('\n  ')}
);
out tags center ${limit};`;
};

const mapOverpassLead = (element, fallbackCity, country) => {
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
  let lastError = 'The map data service could not be reached.';

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { ...JSON_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      });

      if ([429, 502, 503, 504].includes(response.status)) {
        lastError = 'The map service is busy right now. Please try again in a minute.';
        continue;
      }

      if (!response.ok) {
        lastError = `The map data service returned ${response.status}.`;
        continue;
      }

      const payload = await response.json();

      // An empty payload can mean limited coverage on a mirror - try the next one
      if ((payload.elements || []).length === 0 && endpoint !== OVERPASS_ENDPOINTS[OVERPASS_ENDPOINTS.length - 1]) {
        lastError = 'No businesses with a published phone number were found in that area.';
        continue;
      }

      return payload;
    } catch (err) {
      lastError = err.name === 'AbortError' ? 'The map data service timed out. Try again shortly.' : err.message;
    }
  }

  throw new Error(lastError);
};

export async function searchLeads({ city, category = 'offices', limit = 30, country = '' }) {
  const bbox = await geocodeCity(city);

  let payload;
  if (bbox) {
    try {
      payload = await queryOverpass(buildBboxQuery(bbox, category, limit));
    } catch (err) {
      payload = await queryOverpass(buildAreaQuery(city, category, limit));
    }
  } else {
    payload = await queryOverpass(buildAreaQuery(city, category, limit));
  }

  const elements = Array.isArray(payload.elements) ? payload.elements : [];
  const leads = elements.map((element) => mapOverpassLead(element, city, country)).filter(Boolean);

  return {
    leads,
    count: leads.length,
    location: bbox?.label || city,
    source: 'OpenStreetMap',
    attribution: '© OpenStreetMap contributors'
  };
}
