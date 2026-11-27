// The manual lead form opens with the dial code of the chosen country already in the phone field,
// so a form saved without typing the rest stored "+1" as the lead's number. That is a country, not
// a phone number: `tel:` and wa.me cannot call it. The rules below read what the agent typed, keep
// the dial code of the country they picked, and drop the trunk prefix — Egyptian numbers are
// written locally as 01012345678, but WhatsApp and the dialler need +201012345678.

import { dialCodeFor, stripTrunkZero } from './dial-codes.mjs';

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
