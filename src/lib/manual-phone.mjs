// The manual lead form opens with the dial code of the chosen country already in the phone field,
// so a form saved without typing the rest stored "+1" as the lead's number. That is a country, not
// a phone number: `tel:` and wa.me cannot call it. The rules below read what the agent typed, keep
// the dial code of the country they picked, and drop the trunk prefix — Egyptian numbers are
// written locally as 01012345678, but WhatsApp and the dialler need +201012345678.

import { DIAL_CODES, KNOWN_DIAL_CODES, dialCodeFor, stripTrunkZero } from './dial-codes.mjs';

// How many digits a number has after its dial code. Canada and the USA are always ten; Egypt's
// mobiles are ten and its landlines nine.
const NATIONAL_LENGTHS = {
  1: [10],
  20: [9, 10]
};

const digitsOf = (value) => String(value || '').replace(/\D/g, '');

const lengthsFor = (code) => NATIONAL_LENGTHS[code] || [7, 8, 9, 10, 11, 12, 13, 14, 15];

export const manualPhoneFor = (typed, country) => {
  const value = String(typed || '').trim();
  const code = dialCodeFor(country);
  const digits = digitsOf(value);
  const allowed = lengthsFor(code);
  const longest = allowed[allowed.length - 1];

  if (!code) {
    return { ok: false, phone: '', displayPhone: value, error: 'Choose the country for this number first.' };
  }
  if (!digits) {
    return { ok: false, phone: '', displayPhone: value, error: `Enter the ${longest} digits after +${code}.` };
  }

  // The field starts with the dial code, so it comes off before the number is measured
  let national = digits.startsWith('00') ? digits.slice(2) : digits;
  const typedInternational = /^\+/.test(value) || national !== digits;

  if (typedInternational && national.startsWith(code)) {
    national = national.slice(code.length);
  } else if (national.startsWith(code)) {
    // A bare number can also carry the code ("1 416 555 0192"). Take it off only when the shorter
    // reading is the one that fits, so an Egyptian number that happens to start with 20 is not cut.
    const withoutCode = national.slice(code.length);
    if (!allowed.includes(national.length) && allowed.includes(withoutCode.length)) national = withoutCode;
  }

  // The leading zero is how a number is written inside its country; international form has none
  national = stripTrunkZero(national);

  if (!allowed.includes(national.length)) {
    const wanted = allowed.length === 1 ? `${allowed[0]}` : `${allowed[0]}–${longest}`;
    const shown = value || `+${code}`;
    return {
      ok: false,
      phone: '',
      displayPhone: value,
      error: `A ${country} number needs ${wanted} digits after +${code}. "${shown}" is missing some, or belongs to another country.`
    };
  }

  return { ok: true, phone: `+${code}${national}`, displayPhone: `+${code} ${national}`, error: '' };
};

// The public requirements form asks for one number and no country: the customer writes it the way
// they would dial it abroad. The code is read off the front, then the same trunk-zero and
// digit-count rules decide whether it is a number WhatsApp can open, and it is stored in the
// international form that link needs.
const countryForCode = (code) => Object.keys(DIAL_CODES).find((name) => DIAL_CODES[name] === code) || '';

export const publicPhoneFor = (typed) => {
  const value = String(typed || '').trim();
  const digits = digitsOf(value);

  if (!digits) {
    return { ok: false, phone: '', displayPhone: value, error: 'Enter the number we can reach you on WhatsApp.' };
  }

  const writtenInternational = value.startsWith('+') || digits.startsWith('00');
  const international = digits.startsWith('00') ? digits.slice(2) : digits;

  if (!writtenInternational) {
    return {
      ok: false,
      phone: '',
      displayPhone: value,
      error: 'Start the number with its country code, like +20 101 234 5678.'
    };
  }

  const code = KNOWN_DIAL_CODES.find((known) => international.startsWith(known));
  if (!code) {
    return {
      ok: false,
      phone: '',
      displayPhone: value,
      error: 'That does not start with a country code we know, like +1 or +20.'
    };
  }

  const allowed = lengthsFor(code);
  const wanted = allowed.length === 1 ? `${allowed[0]}` : `${allowed[0]}\u2013${allowed[allowed.length - 1]}`;

  if (international.length <= code.length) {
    return { ok: false, phone: '', displayPhone: value, error: `Enter the ${wanted} digits after +${code}.` };
  }

  // The rest is the manual form's own rule: the country's code kept, the trunk zero dropped, the
  // national length measured against the same table
  const checked = manualPhoneFor(`+${code} ${international.slice(code.length)}`, countryForCode(code));
  if (checked.ok) return checked;

  return { ok: false, phone: '', displayPhone: value, error: `A number after +${code} needs ${wanted} digits.` };
};

// A lead's number arrives from a map listing, a website or a pasted list, written the way the
// source writes it: "+20 100 123 4567", "0100 123 4567", or occasionally a country code on its
// own. Every one is stored in the international form WhatsApp opens, using the same rule the
// forms use; a number that is only a code becomes no number at all.
export const leadPhoneFor = (raw, country) => {
  const value = String(raw || '').trim();
  if (!value) return '';

  const code = dialCodeFor(country);
  // Without a country there is nothing to place a local number in, so the digits are kept as they
  // came rather than guessed at
  if (!code) return value.replace(/[^+\d]/g, '');

  const checked = manualPhoneFor(value, country);
  if (checked.ok) return checked.phone;

  // Sources also publish numbers the country's format does not fit (a hotline, a line shared by
  // two offices). Those keep their digits and the code they already carry, but never a bare code
  // and never a trunk zero in front of a national number.
  const digits = value.replace(/\D/g, '');
  const international = digits.startsWith('00') ? digits.slice(2) : digits;
  const other = KNOWN_DIAL_CODES.find((known) => international.startsWith(known));

  if (other && other !== code) {
    const national = stripTrunkZero(international.slice(other.length));
    return national.length >= 7 ? `+${other}${national}` : '';
  }

  const national = stripTrunkZero(international.startsWith(code) ? international.slice(code.length) : international);
  return national.length >= 7 ? `+${code}${national}` : '';
};
