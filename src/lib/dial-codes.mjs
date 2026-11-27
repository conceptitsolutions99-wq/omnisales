// One table of the calling codes the app knows, keyed by the country names the lead data uses.
// The manual lead form prefills it, its validation measures the digits after it, and the WhatsApp
// link builds its number from it, so a country is added once. `code` is stored without the plus.

export const DIAL_CODES = {
  canada: '1',
  usa: '1',
  'united states': '1',
  egypt: '20',
  'saudi arabia': '966',
  'united arab emirates': '971',
  uae: '971',
  qatar: '974',
  kuwait: '965',
  'united kingdom': '44',
  uk: '44'
};

export const dialCodeFor = (country) =>
  DIAL_CODES[String(country || '').toLowerCase().trim()] || '';

// How the form writes it in the phone field
export const dialCodeLabel = (country) => {
  const code = dialCodeFor(country);
  return code ? `+${code}` : '';
};

// Longest first, so +971 is never read as +9 when a typed code is swapped for the chosen country
export const KNOWN_DIAL_CODES = [...new Set(Object.values(DIAL_CODES))].sort(
  (a, b) => b.length - a.length
);

// Egyptian mobiles: 010, 011, 012 or 015 followed by eight digits
export const EGYPT_MOBILE = /^01[0125]\d{8}$/;

// A number is written with its trunk zero at home (01012345678, 02 2345 6789); the international
// form, and WhatsApp, have no trunk zero, so it is dropped in one place.
export const stripTrunkZero = (digits) => String(digits || '').replace(/^0+/, '');
