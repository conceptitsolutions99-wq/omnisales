// A sweep has to keep consulates, government offices, public services and landmarks out of the
// lead list, while still keeping the businesses whose names only look similar.
const test = require('node:test');
const assert = require('node:assert/strict');

const filters = () => import('../src/lib/lead-filters.mjs');

test('a consulate or embassy is dropped by tag, by name or by provider category', async () => {
  const { nonProspectReason } = await filters();

  assert.equal(nonProspectReason({ name: 'Consulate General of Italy', tags: {} }), 'consulate');
  assert.equal(nonProspectReason({ name: 'Consulat général de France à Toronto', tags: {} }), 'consulate');
  assert.equal(nonProspectReason({ name: 'قنصلية مصر', tags: {} }), 'consulate');
  assert.equal(nonProspectReason({ name: 'Embassy of Egypt', tags: {} }), 'consulate');
  assert.equal(nonProspectReason({ name: 'Some Office', tags: { office: 'diplomatic' } }), 'consulate');
  assert.equal(nonProspectReason({ name: 'Some Office', tags: { diplomatic: 'consulate' } }), 'consulate');
  assert.equal(nonProspectReason({ name: 'Some Place', categories: ['office.diplomatic'] }), 'consulate');
});

test('a government office is dropped, in English, French and Arabic', async () => {
  const { nonProspectReason } = await filters();

  assert.equal(nonProspectReason({ name: 'Ministry of Finance', tags: {} }), 'government');
  assert.equal(nonProspectReason({ name: 'Ministère de la Santé', tags: {} }), 'government');
  assert.equal(nonProspectReason({ name: 'Toronto City Hall', tags: {} }), 'government');
  assert.equal(nonProspectReason({ name: 'Hôtel de ville de Montréal', tags: {} }), 'government');
  assert.equal(nonProspectReason({ name: 'Cairo Governorate', tags: {} }), 'government');
  assert.equal(nonProspectReason({ name: 'محافظة القاهرة', tags: {} }), 'government');
  assert.equal(nonProspectReason({ name: 'وزارة المالية', tags: {} }), 'government');
  assert.equal(nonProspectReason({ name: 'Revenue Office', tags: { office: 'government' } }), 'government');
  assert.equal(nonProspectReason({ name: 'Town Office', tags: { amenity: 'townhall' } }), 'government');
  assert.equal(nonProspectReason({ name: 'Civic Centre', categories: ['office.government'] }), 'government');
});

test('police stations, courthouses and post offices count as public services', async () => {
  const { nonProspectReason } = await filters();

  assert.equal(nonProspectReason({ name: 'Police Station', tags: { amenity: 'police' } }), 'government');
  assert.equal(nonProspectReason({ name: 'Ontario Court House', tags: {} }), 'public-service');
  assert.equal(nonProspectReason({ name: 'Palais de justice de Québec', tags: {} }), 'public-service');
  assert.equal(nonProspectReason({ name: 'Main Post Office', tags: {} }), 'public-service');
  assert.equal(nonProspectReason({ name: 'محكمة الجيزة', tags: {} }), 'public-service');
  assert.equal(nonProspectReason({ name: 'Branch', tags: { amenity: 'post_office' } }), 'public-service');
});

test('a museum, monument or tourist site is a landmark', async () => {
  const { nonProspectReason } = await filters();

  assert.equal(nonProspectReason({ name: 'Royal Ontario Museum', tags: { tourism: 'museum' } }), 'landmark');
  assert.equal(nonProspectReason({ name: 'Egyptian Museum', tags: {} }), 'landmark');
  assert.equal(nonProspectReason({ name: 'متحف الفن الحديث', tags: {} }), 'landmark');
  assert.equal(nonProspectReason({ name: 'CN Tower', tags: { tourism: 'attraction' } }), 'landmark');
  assert.equal(nonProspectReason({ name: 'Old Fort', tags: { historic: 'monument' } }), 'landmark');
  assert.equal(nonProspectReason({ name: 'Statue of Liberty', tags: {} }), 'landmark');
  assert.equal(nonProspectReason({ name: 'Visitor Centre', tags: {} }), 'landmark');
  assert.equal(nonProspectReason({ name: 'Place', categories: ['tourism.attraction', 'tourism'] }), 'landmark');
});

test('real businesses are kept, including the names that look institutional', async () => {
  const { nonProspectReason } = await filters();

  assert.equal(nonProspectReason({ name: 'City Dental Studio', tags: { amenity: 'dentist' } }), '');
  assert.equal(nonProspectReason({ name: 'Municipal Employees Credit Union', tags: { office: 'financial' } }), '');
  assert.equal(nonProspectReason({ name: 'Embassy Suites by Hilton Toronto', tags: { tourism: 'hotel' } }), '');
  assert.equal(nonProspectReason({ name: 'Ministry Coffee Roasters', tags: { amenity: 'cafe' } }), '');
  assert.equal(nonProspectReason({ name: 'Police Credit Union', tags: { office: 'financial' } }), '');
  assert.equal(nonProspectReason({ name: 'Liberty Law Chambers', tags: { office: 'lawyer' } }), '');
  assert.equal(nonProspectReason({ name: 'Cairo Kitchen', tags: { amenity: 'restaurant' } }), '');
  assert.equal(nonProspectReason({ name: 'Nile Hardware', tags: { shop: 'hardware' } }), '');
});

// The header comment promises these stay, and the tag sets have to keep that promise
test('schools and places of worship are left in', async () => {
  const { nonProspectReason } = await filters();

  assert.equal(nonProspectReason({ name: 'Bright Minds Academy', tags: { office: 'school' } }), '');
  assert.equal(nonProspectReason({ name: 'Cairo University', tags: { office: 'university' } }), '');
  assert.equal(nonProspectReason({ name: 'Northside College', tags: { office: 'college' } }), '');
  assert.equal(nonProspectReason({ name: 'St. Michael Parish', tags: { amenity: 'place_of_worship' } }), '');
  assert.equal(nonProspectReason({ name: 'Dar El Salam', tags: { office: 'religion' } }), '');
});

test('an empty or untagged listing is not treated as an institution', async () => {
  const { nonProspectReason } = await filters();

  assert.equal(nonProspectReason(), '');
  assert.equal(nonProspectReason({}), '');
  assert.equal(nonProspectReason({ name: '', tags: null, categories: null }), '');
});
