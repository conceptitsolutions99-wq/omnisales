// Real business leads, fetched straight from the browser so a static deployment
// needs no backend. OpenStreetMap's Overpass is tried first because it is free and
// key-less; when it is overloaded, Geoapify's free plan (3,000 credits/day, no card)
// takes over. Geoapify requires a browser key to be domain-restricted.
// Data © OpenStreetMap contributors (ODbL) · Powered by Geoapify.

const JSON_HEADERS = { Accept: 'application/json' };

// osm.ch only carries Swiss data, so it is deliberately excluded
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter'
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

// Geoapify taxonomy equivalents of the same six categories
const GEOAPIFY_CATEGORIES = {
  offices: 'office',
  professional: 'office',
  retail: 'commercial',
  food: 'catering',
  health: 'healthcare',
  trades: 'service'
};

const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY || '';

// The timer stays armed until the body is read: a response that stalls mid-body
// would otherwise hang the request forever.
const requestWithTimeout = async (url, options = {}, timeoutMs = 7000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
};

const readJson = (body) => {
  try {
    return JSON.parse(body);
  } catch (err) {
    return null;
  }
};

// Resolve the city to a bounding box so matching does not depend on exact OSM names
const geocodeCache = new Map();

const geocodeCity = async (city) => {
  const key = city.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.bbox;

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
  const response = await requestWithTimeout(url, { headers: JSON_HEADERS }, 6000);
  if (!response.ok) return null;

  const results = readJson(response.body);
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
      const response = await requestWithTimeout(endpoint, {
        method: 'POST',
        headers: { ...JSON_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      }, 6000);

      if ([429, 502, 503, 504].includes(response.status)) {
        lastError = 'The map service is busy right now. Please try again in a minute.';
        continue;
      }

      if (!response.ok) {
        lastError = `The map data service returned ${response.status}.`;
        continue;
      }

      const payload = readJson(response.body);
      if (!payload) {
        lastError = 'The map data service returned an unexpected response.';
        continue;
      }

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

const searchWithOverpass = async ({ city, category, limit, country, bbox }) => {
  const query = bbox ? buildBboxQuery(bbox, category, limit) : buildAreaQuery(city, category, limit);
  const payload = await queryOverpass(query);
  const elements = Array.isArray(payload.elements) ? payload.elements : [];
  return elements.map((element) => mapOverpassLead(element, city, country)).filter(Boolean);
};

// Geoapify Places returns the listings; phone/email/website live in Place Details,
// so the best few results are expanded (1 credit per place on the free plan).
const searchWithGeoapify = async ({ city, category, limit, country, bbox }) => {
  if (!GEOAPIFY_KEY || !bbox) return [];

  const categories = GEOAPIFY_CATEGORIES[category] || 'office';
  const filter = `rect:${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
  const url =
    `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(categories)}` +
    `&filter=${encodeURIComponent(filter)}&limit=${Math.min(Math.max(limit, 1), 20)}` +
    `&apiKey=${encodeURIComponent(GEOAPIFY_KEY)}`;

  const response = await requestWithTimeout(url, { headers: JSON_HEADERS }, 9000);
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      'Geoapify rejected the API key. Check VITE_GEOAPIFY_API_KEY, and make sure the key allows this site domain.'
    );
  }
  if (!response.ok) return [];

  const data = readJson(response.body);
  const places = (data?.features || []).map((feature) => feature.properties).filter((place) => place?.place_id);

  const expanded = await Promise.all(
    places.slice(0, 8).map(async (place) => {
      const detailUrl =
        `https://api.geoapify.com/v2/place-details?id=${encodeURIComponent(place.place_id)}` +
        `&apiKey=${encodeURIComponent(GEOAPIFY_KEY)}`;
      try {
        const detail = await requestWithTimeout(detailUrl, { headers: JSON_HEADERS }, 9000);
        if (!detail.ok) return null;
        const payload = readJson(detail.body);
        return payload?.features?.[0]?.properties || null;
      } catch (err) {
        return null;
      }
    })
  );

  return expanded.filter((place) => place?.contact?.phone).map((place) => ({
    id: `geoapify-${place.place_id || place.formatted}`,
    name: place.name || place.address_line1 || 'Unnamed business',
    company: place.name || place.address_line1 || 'Unnamed business',
    phone: String(place.contact.phone).replace(/[^+\d]/g, ''),
    displayPhone: place.contact.phone,
    email: place.contact.email || '',
    website: place.website || '',
    address: [place.address_line1, place.address_line2].filter(Boolean).join(', '),
    country: country || (place.country_code ? place.country_code.toUpperCase() : ''),
    region: place.city || place.state || city,
    size: 'Unknown',
    solution: '',
    status: 'New',
    value: 0,
    notes: `Verified listing via Geoapify${place.website ? ' · website on file' : ' · no website listed'}`,
    createdAt: new Date().toISOString().split('T')[0],
    lat: place.lat ?? null,
    lon: place.lon ?? null
  }));
};

export async function searchLeads({ city, category = 'offices', limit = 30, country = '' }) {
  const bbox = await geocodeCity(city);
  const options = { city, category, limit, country, bbox };

  let overpassLeads = [];
  let overpassError = null;

  try {
    overpassLeads = await searchWithOverpass(options);
  } catch (err) {
    overpassError = err;
  }

  if (overpassLeads.length > 0) {
    return {
      leads: overpassLeads,
      count: overpassLeads.length,
      location: bbox?.label || city,
      source: 'OpenStreetMap',
      attribution: '© OpenStreetMap contributors'
    };
  }

  // Overpass is busy, timed out, or had nothing: fall back to the keyed provider
  let geoapifyError = null;
  try {
    const geoapifyLeads = await searchWithGeoapify(options);
    if (geoapifyLeads.length > 0) {
      return {
        leads: geoapifyLeads,
        count: geoapifyLeads.length,
        location: bbox?.label || city,
        source: 'Geoapify',
        attribution: 'Powered by Geoapify · Data © OpenStreetMap contributors'
      };
    }
  } catch (err) {
    geoapifyError = err;
  }

  // A bad key is the actionable problem here, so it outranks the map service being busy
  if (geoapifyError) throw geoapifyError;
  if (overpassError) throw overpassError;

  return {
    leads: [],
    count: 0,
    location: bbox?.label || city,
    source: 'OpenStreetMap',
    attribution: '© OpenStreetMap contributors'
  };
}
