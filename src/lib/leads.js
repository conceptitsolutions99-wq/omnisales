// Real business leads, fetched straight from the browser so a static deployment
// needs no backend. OpenStreetMap's Overpass is tried first because it is free and
// key-less; when it is overloaded, Geoapify's free plan (3,000 credits/day, no card)
// takes over. Geoapify requires a browser key to be domain-restricted.
// Data © OpenStreetMap contributors (ODbL) · Powered by Geoapify.

import { firstGeoapifyResult, windowFromGeoapify, windowFromNominatim } from './geo-window.mjs';
import { LEAD_MARKETS, mixLeads } from './lead-markets.mjs';

const JSON_HEADERS = { Accept: 'application/json' };

// osm.ch only carries Swiss data, so it is deliberately excluded
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter'
];

// The public Overpass instances regularly take 15–25s for a city-sized query, so a short ceiling
// abandoned searches that would have succeeded and pushed every request onto the paid provider.
// Both endpoints serve the same database, so they are asked at once and the first answer wins.
// The ceiling therefore depends on whether there is anywhere to fall back to (see below).

// Each category maps to OSM selectors that require a published phone number
// Each category asks for a published phone or a published email. Most listings carry a phone,
// but an email is what outreach actually needs, so the email tag is searched in its own right
// instead of only being read off places that happened to have a number.
// A business that publishes only a mobile or WhatsApp number is the most valuable kind of lead
// for this team: those are the numbers WhatsApp can actually reach. Mobile and WhatsApp tags
// were not searched for at all, so every search returned landlines and switchboards.
const withContactTags = (base) => [
  `${base}["phone"]`,
  `${base}["contact:phone"]`,
  `${base}["mobile"]`,
  `${base}["contact:mobile"]`,
  `${base}["contact:whatsapp"]`,
  `${base}["email"]`,
  `${base}["contact:email"]`
];

const OFFICE = 'nwr["office"]';
const PROFESSIONAL = 'nwr["office"~"^(lawyer|accountant|insurance|estate_agent|financial|it|company|consulting)$"]';
const SHOP = 'nwr["shop"]';
const FOOD = 'nwr["amenity"~"^(restaurant|cafe|bar|fast_food|bakery|pub)$"]';
const HEALTH = 'nwr["amenity"~"^(dentist|clinic|doctors|pharmacy|veterinary)$"]';
const CRAFT = 'nwr["craft"]';
const REPAIR = 'nwr["shop"~"^(car_repair|doityourself|hardware|electrical)$"]';

const LEAD_CATEGORIES = {
  offices: withContactTags(OFFICE),
  professional: withContactTags(PROFESSIONAL),
  retail: withContactTags(SHOP),
  food: withContactTags(FOOD),
  health: withContactTags(HEALTH),
  trades: [...withContactTags(CRAFT), ...withContactTags(REPAIR)]
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

// A bounded Cairo query can still sit on the free map server for ~38s. When the keyed provider
// is configured, waiting the full ceiling only delays the answer, so the free attempt is cut
// short and the search falls back quickly. Without a fallback the long ceiling stays, because
// abandoning the only source would return nothing at all.
const OVERPASS_TIMEOUT_MS = GEOAPIFY_KEY ? 6000 : 14000;

// A search can run without a country chosen, and the listings still need one for filtering and
// for the outreach copy, so the geocoded place name and Geoapify's country code fill it in.
const COUNTRY_NAMES = { eg: 'Egypt', ca: 'Canada', us: 'USA' };

// The chosen market is handed to both geocoders, so a repeated city name resolves in the
// country the agent picked ("Alexandria" is Egypt, not Virginia; "London" is not Ontario).
const COUNTRY_CODES = { Canada: 'ca', USA: 'us', Egypt: 'eg' };

const countryFromCode = (code) => COUNTRY_NAMES[String(code || '').toLowerCase()] || String(code || '').toUpperCase();

const countryFromLabel = (label) => {
  const text = String(label || '');
  // Nominatim answers Cairo in Arabic, so the local spelling has to count as Egypt too
  if (/egypt|مصر/i.test(text)) return 'Egypt';
  if (/united states|\busa\b/i.test(text)) return 'USA';
  if (/canada/i.test(text)) return 'Canada';
  return '';
};

// Exposed so the setup screen can report whether the fallback is wired into this build
export const hasGeoapifyKey = Boolean(GEOAPIFY_KEY);

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

// The search window and the reading of a geocoder's answer live in geo-window.mjs, so the node
// tests can check them without the browser's fetch and Vite key.

// Resolve the city to a bounding box so matching does not depend on exact OSM names
const geocodeCache = new Map();

const geocodeCity = async (city, country = '') => {
  const code = COUNTRY_CODES[country] || '';
  const key = `${city.toLowerCase()}|${code}`;
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.bbox;

  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1` +
    (code ? `&countrycodes=${code}` : '');
  // A slow geocoder must not fail the whole search: both providers can resolve a city name
  let response;
  try {
    response = await requestWithTimeout(url, { headers: JSON_HEADERS }, 5000);
  } catch (err) {
    return null;
  }
  if (!response.ok) return null;

  const bbox = windowFromNominatim(readJson(response.body));
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

// A five-digit shortcode (a delivery hotline, not a line a person answers) is not a lead
const hasReachableNumber = (value) => String(value || '').replace(/\D/g, '').length >= 7;

const mapOverpassLead = (element, fallbackCity, country) => {
  const tags = element.tags || {};
  // Mobile and WhatsApp numbers are kept apart from the landline: they are what WhatsApp can
  // reach, and the agent has to be able to see which one they are about to message
  const mobile = tags.mobile || tags['contact:mobile'] || '';
  const whatsapp = tags['contact:whatsapp'] || tags.whatsapp || '';
  const landline = tags.phone || tags['contact:phone'] || '';
  const rawPhone = landline || mobile || whatsapp;
  const email = tags.email || tags['contact:email'] || '';
  const name = tags.name || tags['operator'];
  // A business that publishes only an email is still worth outreach, but a shortcode is not
  if (!name || (!email && !hasReachableNumber(rawPhone))) return null;

  const website = tags.website || tags['contact:website'] || '';
  // Facebook and Instagram cannot be read by a server (they answer with a login wall or a 400),
  // so their addresses travel with the lead and the agent opens them, signed in, themselves
  const facebook = tags['contact:facebook'] || tags.facebook || '';
  const instagram = tags['contact:instagram'] || tags.instagram || '';
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const city = tags['addr:city'] || fallbackCity;

  return {
    id: `osm-${element.type}-${element.id}`,
    name,
    company: name,
    phone: rawPhone.replace(/[^+\d]/g, ''),
    displayPhone: rawPhone || 'No phone on file',
    mobile: mobile.replace(/[^+\d]/g, ''),
    whatsapp: whatsapp.replace(/[^+\d]/g, ''),
    email,
    website,
    facebook,
    instagram,
    address: [street, city].filter(Boolean).join(', '),
    country,
    region: city,
    size: 'Unknown',
    solution: '',
    status: 'New',
    value: 0,
    notes: `Real OpenStreetMap listing${website ? ' · website on file' : ' · no website listed'}${email ? ' · email published' : ''}`,
    createdAt: new Date().toISOString().split('T')[0],
    lat: element.lat ?? element.center?.lat ?? null,
    lon: element.lon ?? element.center?.lon ?? null
  };
};

const askOverpass = async (endpoint, query) => {
  const response = await requestWithTimeout(endpoint, {
    method: 'POST',
    headers: { ...JSON_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`
  }, OVERPASS_TIMEOUT_MS);

  if ([429, 502, 503, 504].includes(response.status)) {
    throw new Error('The map service is busy right now. Please try again in a minute.');
  }
  if (!response.ok) throw new Error(`The map data service returned ${response.status}.`);

  const payload = readJson(response.body);
  if (!payload) throw new Error('The map data service returned an unexpected response.');
  return payload;
};

const queryOverpass = async (query) => {
  const attempts = OVERPASS_ENDPOINTS.map((endpoint) =>
    askOverpass(endpoint, query).then(
      (payload) => ({ ok: true, payload }),
      (error) => ({ ok: false, error })
    )
  );

  const results = await Promise.all(attempts);
  const answered = results.filter((result) => result.ok);

  // A mirror with partial coverage can answer with nothing while the main instance has the city,
  // so an empty answer is only accepted when no endpoint had anything
  const withData = answered.find((result) => (result.payload.elements || []).length > 0);
  if (withData) return withData.payload;
  if (answered.length > 0) return answered[0].payload;

  const failure = results.find((result) => !result.ok)?.error;
  throw failure?.name === 'AbortError'
    ? new Error('The map data service timed out. Try again shortly.')
    : failure || new Error('The map data service could not be reached.');
};

const searchWithOverpass = async ({ city, category, limit, country, bbox }) => {
  const query = bbox ? buildBboxQuery(bbox, category, limit) : buildAreaQuery(city, category, limit);
  const payload = await queryOverpass(query);
  const elements = Array.isArray(payload.elements) ? payload.elements : [];
  return elements.map((element) => mapOverpassLead(element, city, country)).filter(Boolean);
};

// Geoapify Places returns the listings; phone/email/website live in Place Details,
// so the best few results are expanded (1 credit per place on the free plan).
// Geoapify can resolve the city itself, so the fallback still works when Nominatim fails
const geocodeWithGeoapify = async (city, country = '') => {
  const code = COUNTRY_CODES[country] || '';
  const base =
    `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(city)}` +
    `&limit=1&format=json${code ? `&filter=countrycode:${code}` : ''}` +
    `&apiKey=${encodeURIComponent(GEOAPIFY_KEY)}`;

  const ask = async (extra) => {
    const response = await requestWithTimeout(`${base}${extra}`, { headers: JSON_HEADERS }, 8000);
    if (!response.ok) return null;

    return firstGeoapifyResult(readJson(response.body));
  };

  // "New York" without a type resolves to the state, whose 0.25-degree window lands upstate and
  // returns a handful of listings with no contact details. The city is asked for first, and a
  // district or neighbourhood name that is not a city falls back to the untyped answer, which is
  // then anchored on the result's own point.
  if (!GEOAPIFY_KEY) return null;
  const first = (await ask('&type=city')) || (await ask(''));
  return windowFromGeoapify(first);
};

// The same business has a different id on each provider, so a listing saved from OpenStreetMap
// is recognised by its name together with its position before any detail credit is spent.
// Legal forms differ between listings for one business ("Alpha Ltd" vs "Alpha"), so they are
// dropped; the proximity check still has to agree before anything is treated as saved.
const LEGAL_SUFFIXES = /\b(ltd|limited|llc|inc|incorporated|corp|corporation|plc|gmbh|pty|sarl|srl|bv)\b/g;

const normalName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const distanceInMetres = (a, b) => {
  const values = [a.lat, a.lon, b.lat, b.lon].map(Number);
  if (!values.every(Number.isFinite)) return Infinity;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const [aLat, aLon, bLat, bLon] = values;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const x = dLon * Math.cos(toRad((aLat + bLat) / 2));
  return Math.sqrt(dLat * dLat + x * x) * 6371000;
};

// Two listings of one business can be a few doors apart, but two different businesses rarely share
// a name that closely, so the radius only has to absorb that drift
const SAME_PLACE_METRES = 250;

// Numbers are written many ways ("+1-416-967-1800" / "+1 416 967 1800"), and the country code
// is not always stored, so the last ten digits are what gets compared.
const normalPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
};

// Geoapify keeps the original OpenStreetMap object in every listing, which identifies a business
// even when the two providers spell its name differently
const OSM_TYPE = { n: 'node', w: 'way', r: 'relation' };

const isAlreadySaved = (place, knownIds, knownPlaces, knownPhones) => {
  if (knownIds?.has(`geoapify-${place.place_id}`)) return true;

  const listingPhone = normalPhone(place.contact?.phone || place.datasource?.raw?.phone);
  if (listingPhone && knownPhones?.has(listingPhone)) return true;

  const raw = place.datasource?.raw;
  const osmId = raw?.osm_id && OSM_TYPE[raw.osm_type] ? `osm-${OSM_TYPE[raw.osm_type]}-${raw.osm_id}` : '';
  if (osmId && knownIds?.has(osmId)) return true;

  const name = normalName(place.name);
  if (!name || !knownPlaces?.length) return false;
  return knownPlaces.some(
    (saved) => normalName(saved.name) === name && distanceInMetres(saved, place) <= SAME_PLACE_METRES
  );
};

const searchWithGeoapify = async ({ city, category, limit, country, bbox, offset = 0, knownIds, knownPlaces, knownPhones }) => {
  if (!GEOAPIFY_KEY) return [];

  const area = bbox || (await geocodeWithGeoapify(city, country));
  if (!area) return [];

  const categories = GEOAPIFY_CATEGORIES[category] || 'office';
  const filter = `rect:${area.west},${area.south},${area.east},${area.north}`;
  // offset matters: without it every search returns the same first page, so repeat searches
  // found only businesses that were already in the list
  const url =
    `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(categories)}` +
    `&filter=${encodeURIComponent(filter)}&limit=${Math.min(Math.max(limit, 1), 50)}` +
    `&offset=${Math.max(0, Number(offset) || 0)}` +
    `&apiKey=${encodeURIComponent(GEOAPIFY_KEY)}`;

  const response = await requestWithTimeout(url, { headers: JSON_HEADERS }, 12000);
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      'Geoapify rejected the API key. Check VITE_GEOAPIFY_API_KEY, and make sure the key allows this site domain.'
    );
  }
  if (!response.ok) return [];

  const data = readJson(response.body);
  const places = (data?.features || []).map((feature) => feature.properties).filter((place) => place?.place_id);

  // Details cost one credit each, so businesses already in the list are dropped before the
  // spend instead of after it: a repeat search pays only for places the agent has not seen.
  // Saved numbers arrive in whatever format the list holds, so they are reduced once here
  const phoneIndex = new Set([...(knownPhones || [])].map(normalPhone).filter(Boolean));

  const unknown = places.filter((place) => !isAlreadySaved(place, knownIds, knownPlaces, phoneIndex));
  const skippedKnown = places.length - unknown.length;

  const expanded = await Promise.all(
    unknown.slice(0, 12).map(async (place) => {
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

  const rawTags = (place) => place?.datasource?.raw || {};
  // Geoapify spends a detail credit per listing, so only a listing with a way to reach it is
  // kept — and a mobile or WhatsApp number counts, because that is what the team messages.
  const reachable = (place) => {
    const raw = rawTags(place);
    const phone =
      place?.contact?.phone ||
      raw.phone ||
      raw['contact:phone'] ||
      raw.mobile ||
      raw['contact:mobile'] ||
      raw['contact:whatsapp'] ||
      raw.whatsapp;
    const email = place?.contact?.email || raw.email || raw['contact:email'];
    return Boolean(email) || hasReachableNumber(phone);
  };

  const leads = expanded
    .filter(reachable)
    .map((place) => {
    const raw = rawTags(place);
    const mobile = String(raw.mobile || raw['contact:mobile'] || '');
    const whatsapp = String(raw['contact:whatsapp'] || raw.whatsapp || '');
    const phone = place.contact?.phone || raw.phone || raw['contact:phone'] || mobile || whatsapp || '';
    return {
    id: `geoapify-${place.place_id || place.formatted}`,
    name: place.name || place.address_line1 || 'Unnamed business',
    company: place.name || place.address_line1 || 'Unnamed business',
    phone: String(phone).replace(/[^+\d]/g, ''),
    displayPhone: phone || 'No phone on file',
    mobile: mobile.replace(/[^+\d]/g, ''),
    whatsapp: whatsapp.replace(/[^+\d]/g, ''),
    email: place.contact?.email || raw.email || raw['contact:email'] || '',
    website: place.website || '',
    facebook: place.contact?.facebook || raw['contact:facebook'] || '',
    instagram: place.contact?.instagram || raw['contact:instagram'] || '',
    address: [place.address_line1, place.address_line2].filter(Boolean).join(', '),
    country: country || countryFromCode(place.country_code),
    region: place.city || place.state || city,
    size: 'Unknown',
    solution: '',
    status: 'New',
    value: 0,
    notes: `Verified listing via Geoapify${place.website ? ' · website on file' : ' · no website listed'}${whatsapp || mobile ? ' · mobile/WhatsApp number on file' : ''}`,
    createdAt: new Date().toISOString().split('T')[0],
    lat: place.lat ?? null,
    lon: place.lon ?? null
    };
    });

  return { leads, skippedKnown, hadResults: places.length > 0 };
};

export async function searchLeads({ city, category = 'offices', limit = 30, country = '', offset = 0, knownIds, knownPlaces, knownPhones }) {
  const bbox = await geocodeCity(city, country);
  const resolvedCountry = country || countryFromLabel(bbox?.label);
  const areaLimited = Boolean(bbox?.limited);
  const options = { city, category, limit, country: resolvedCountry, bbox, offset, knownIds, knownPlaces, knownPhones };

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
      attribution: '© OpenStreetMap contributors',
      areaLimited,
      skippedKnown: 0
    };
  }

  // Overpass is busy, timed out, or had nothing: fall back to the keyed provider
  if (!GEOAPIFY_KEY) {
    throw new Error(
      'OpenStreetMap is unavailable right now and no fallback is configured. Add VITE_GEOAPIFY_API_KEY to the environment and redeploy.'
    );
  }

  let geoapifyLeads = [];
  let geoapifySkipped = 0;
  let geoapifyError = null;
  try {
    const result = await searchWithGeoapify(options);
    geoapifyLeads = result.leads;
    geoapifySkipped = result.skippedKnown;
  } catch (err) {
    geoapifyError = err;
  }

  if (geoapifyLeads.length > 0) {
    return {
      leads: geoapifyLeads,
      count: geoapifyLeads.length,
      location: bbox?.label || city,
      source: 'Geoapify',
      attribution: 'Powered by Geoapify · Data © OpenStreetMap contributors',
      areaLimited,
      skippedKnown: geoapifySkipped
    };
  }

  // Every listing on this page is already saved: say so instead of reporting a dead end
  if (geoapifySkipped > 0) {
    return {
      leads: [],
      count: 0,
      allKnown: true,
      location: bbox?.label || city,
      source: 'Geoapify',
      attribution: 'Powered by Geoapify · Data © OpenStreetMap contributors',
      areaLimited,
      skippedKnown: geoapifySkipped
    };
  }

  // A timeout is not worth showing as "aborted without reason"
  if (geoapifyError?.name === 'AbortError') {
    throw new Error('The lead search timed out. Try again, or pick a smaller city.');
  }

  // A bad key is the actionable problem here, so it outranks the map service being busy
  if (geoapifyError) throw geoapifyError;

  throw new Error(
    `OpenStreetMap is unavailable and Geoapify returned no businesses with a phone number in ${city}. Try a larger city or a different category.`
  );

  return {
    leads: [],
    count: 0,
    location: bbox?.label || city,
    source: 'OpenStreetMap',
    attribution: '© OpenStreetMap contributors'
  };
}

// One fetch, several markets: each city is searched with its own country and offset, and the
// answers are mixed together. A market that fails (busy map server, thin coverage) is reported
// on its own instead of taking the whole search down with it.
export async function searchLeadsAcrossMarkets({
  markets = LEAD_MARKETS,
  category = 'offices',
  limit = 10,
  offsets = {},
  knownIds,
  knownPlaces,
  knownPhones
} = {}) {
  const results = await Promise.all(
    markets.map(async (market) => {
      try {
        const data = await searchLeads({
          city: market.city,
          category: market.category || category,
          limit,
          country: market.country,
          offset: Number(offsets[market.city] || 0),
          knownIds,
          knownPlaces,
          knownPhones
        });
        return { market, data };
      } catch (err) {
        return { market, error: err };
      }
    })
  );

  const leads = mixLeads(results.map((result) => result.data?.leads || []));

  return {
    leads,
    count: leads.length,
    markets: results.map(({ market, data, error }) => ({
      city: market.city,
      country: market.country,
      count: data?.leads?.length || 0,
      allKnown: Boolean(data?.allKnown),
      areaLimited: Boolean(data?.areaLimited),
      error: error ? error.message : ''
    })),
    skippedKnown: results.reduce((total, result) => total + (result.data?.skippedKnown || 0), 0),
    allKnown: results.length > 0 && results.every((result) => result.data?.allKnown),
    areaLimited: results.some((result) => result.data?.areaLimited),
    source: 'OpenStreetMap + Geoapify',
    attribution: '© OpenStreetMap contributors · Powered by Geoapify'
  };
}
