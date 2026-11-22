// A geocoder answers with the whole municipality: Cairo's box is about 160 km across, and a map
// query over that much ground takes a minute or is refused outright. The search is bounded to a
// window around the city centre instead, which is where a city's businesses are, and the result
// says the area was limited so the agent knows why the list is town-centre shaped.
//
// This lives apart from leads.js (a browser module, with fetch and a Vite key) so the windowing
// and the reading of a geocoder's answer can be tested directly by the node test runner.
export const MAX_SEARCH_SPAN_DEGREES = 0.25;

export const limitBox = (bbox, centre) => {
  if (!bbox) return null;

  const latSpan = bbox.north - bbox.south;
  const lonSpan = bbox.east - bbox.west;
  const limited = latSpan > MAX_SEARCH_SPAN_DEGREES || lonSpan > MAX_SEARCH_SPAN_DEGREES;
  if (!limited) return { ...bbox, limited: false };

  // A city name can resolve to a state or a country of the same name ("New York" is all three),
  // and the middle of such a box is farmland or desert: a US search then came back with a
  // handful of listings and no contact details. The resolved place's own point is where the name
  // actually is, so the window is centred there whenever the geocoder gives one.
  const pointLat = Number(centre?.lat);
  const pointLon = Number(centre?.lon);
  const anchored = Number.isFinite(pointLat) && Number.isFinite(pointLon);
  const latCentre = anchored ? pointLat : (bbox.north + bbox.south) / 2;
  const lonCentre = anchored ? pointLon : (bbox.east + bbox.west) / 2;
  const latHalf = Math.min(latSpan, MAX_SEARCH_SPAN_DEGREES) / 2;
  const lonHalf = Math.min(lonSpan, MAX_SEARCH_SPAN_DEGREES) / 2;

  return {
    south: latCentre - latHalf,
    north: latCentre + latHalf,
    west: lonCentre - lonHalf,
    east: lonCentre + lonHalf,
    label: bbox.label,
    limited: true
  };
};

// Nominatim answers a list of matches, best first, with the box as [south, north, west, east]
// strings and the place's own point alongside it. Only the best match is used.
export const windowFromNominatim = (results) => {
  if (!Array.isArray(results) || results.length === 0) return null;

  const [south, north, west, east] = (results[0].boundingbox || []).map(Number);
  if (![south, north, west, east].every(Number.isFinite)) return null;

  return limitBox(
    { south, north, west, east, label: results[0].display_name },
    { lat: results[0].lat, lon: results[0].lon }
  );
};

// Without format=json Geoapify answers a GeoJSON FeatureCollection, which has no `results`:
// reading only that shape silently returned nothing and left every US search empty. Both shapes
// are accepted, so a change on their side cannot break the fallback again.
export const firstGeoapifyResult = (data) =>
  data?.results?.[0] || data?.features?.[0]?.properties || null;

export const windowFromGeoapify = (result) => {
  const box = result?.bbox;
  if (!box) return null;

  return limitBox(
    { west: box.lon1, south: box.lat1, east: box.lon2, north: box.lat2, label: result.formatted },
    { lat: result.lat, lon: result.lon }
  );
};
