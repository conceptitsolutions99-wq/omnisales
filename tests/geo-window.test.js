// The lead search bounds a city to a window before asking the map server, and the window comes
// from a geocoder's answer. A state or country that shares the city's name must be shrunk and
// anchored on the city's own point, while a box that is already city-sized must be left alone.
const test = require('node:test');
const assert = require('node:assert/strict');

const geo = () => import('../src/lib/geo-window.mjs');

const span = (box) => ({
  lat: Number((box.north - box.south).toFixed(6)),
  lon: Number((box.east - box.west).toFixed(6))
});

const centre = (box) => ({
  lat: Number(((box.north + box.south) / 2).toFixed(6)),
  lon: Number(((box.east + box.west) / 2).toFixed(6))
});

test('a state-sized box is shrunk to the cap and anchored on the city point', async () => {
  const { limitBox } = await geo();

  // "New York" resolves to the whole state; the city's own point is New York City
  const box = limitBox(
    { south: 40.4774, north: 45.0159, west: -79.7624, east: -71.7517, label: 'New York, United States' },
    { lat: '40.7128', lon: '-74.0060' }
  );

  assert.equal(box.limited, true);
  assert.deepEqual(span(box), { lat: 0.25, lon: 0.25 });
  // The window sits on the point, not on the middle of the state (which would be farmland)
  assert.deepEqual(centre(box), { lat: 40.7128, lon: -74.006 });
  assert.equal(box.label, 'New York, United States');
});

test('a city-sized box is returned unchanged', async () => {
  const { limitBox } = await geo();

  // Cairo's own box is about 0.1 by 0.2 degrees: already tighter than the cap in both directions
  const cairo = { south: 30.0, north: 30.1, west: 31.2, east: 31.4, label: 'القاهرة, مصر' };
  const box = limitBox(cairo, { lat: '30.0444', lon: '31.2357' });

  assert.deepEqual(box, { ...cairo, limited: false });
});

test('a box too wide in one direction only is capped in that direction', async () => {
  const { limitBox } = await geo();

  // A long coastal strip: already narrow enough north-south, far too wide east-west
  const box = limitBox(
    { south: 43.5, north: 43.6, west: -79.5, east: -76.0, label: 'Strip' },
    { lat: 43.55, lon: -79.4 }
  );

  assert.equal(box.limited, true);
  assert.deepEqual(span(box), { lat: 0.1, lon: 0.25 });
  assert.deepEqual(centre(box), { lat: 43.55, lon: -79.4 });
});

test('without a point the window is centred on the box itself', async () => {
  const { limitBox } = await geo();

  const box = limitBox({ south: 40, north: 42, west: -76, east: -72, label: 'Somewhere' });

  assert.equal(box.limited, true);
  assert.deepEqual(centre(box), { lat: 41, lon: -74 });
});

test('Nominatim: the best match is read, and an empty answer gives no window', async () => {
  const { windowFromNominatim } = await geo();

  const box = windowFromNominatim([
    { boundingbox: ['40.5503', '40.7394', '-74.0567', '-73.8329'], lat: '40.6501', lon: '-73.9496', display_name: 'Brooklyn, Kings County, New York, United States' },
    { boundingbox: ['-90', '-89', '-1', '1'], lat: '0', lon: '0', display_name: 'Somewhere else' }
  ]);

  assert.deepEqual(box, {
    south: 40.5503,
    north: 40.7394,
    west: -74.0567,
    east: -73.8329,
    label: 'Brooklyn, Kings County, New York, United States',
    limited: false
  });
  assert.equal(windowFromNominatim([]), null);
  assert.equal(windowFromNominatim(null), null);
});

test('Geoapify: both answer shapes are read, and a missing box gives no window', async () => {
  const { firstGeoapifyResult, windowFromGeoapify } = await geo();

  const json = { results: [{ formatted: 'Nasr City, Cairo, Egypt', lat: 30.0511, lon: 31.3656 }] };
  const geojson = { features: [{ properties: { formatted: 'Midtown, New York, NY', lat: 40.7549, lon: -73.984 } }] };

  assert.equal(firstGeoapifyResult(json)?.formatted, 'Nasr City, Cairo, Egypt');
  assert.equal(firstGeoapifyResult(geojson)?.formatted, 'Midtown, New York, NY');
  assert.equal(firstGeoapifyResult({}), null);

  const box = windowFromGeoapify({
    formatted: 'Midtown, New York, NY',
    lat: 40.7549,
    lon: -73.984,
    bbox: { lat1: 40.7451, lat2: 40.7651, lon1: -73.9948, lon2: -73.9748 }
  });
  assert.deepEqual(box, {
    south: 40.7451,
    north: 40.7651,
    west: -73.9948,
    east: -73.9748,
    label: 'Midtown, New York, NY',
    limited: false
  });
  assert.equal(windowFromGeoapify({ formatted: 'No box' }), null);
});
