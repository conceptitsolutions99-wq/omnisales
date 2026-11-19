// A generated lead is only useful if outreach can actually reach it. Most listings publish a
// switchboard landline and nothing else, so the list has to say which channels each lead has
// (email, WhatsApp, website, social page) instead of showing a bare phone number and leaving the
// agent to find out the hard way.

export const COUNTRY_DIAL_CODES = {
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

// Egyptian mobiles: 010/011/012/015 followed by eight digits
export const EGYPT_MOBILE = /^01[0125]\d{8}$/;

const digitsOf = (value) => String(value || '').replace(/\D/g, '');

// WhatsApp needs the number in international form. Leads carry the number as it was typed,
// sometimes with a leading 0 and sometimes with the wrong country, so the trunk prefix is
// removed and a dialling code is only added when the pattern is recognisable — a guess here
// opens WhatsApp on a blank page with an invalid number, which is worse than saying so.
export const whatsappNumberFor = (lead) => {
  const source = lead?.whatsapp || lead?.mobile || lead?.phone || '';
  const raw = String(source).trim();
  const typedInternational = raw.startsWith('+') || /^00\d/.test(digitsOf(raw));
  let digits = digitsOf(raw);
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (typedInternational && raw.startsWith('+')) return digits;
  if (EGYPT_MOBILE.test(digits)) return `20${digits.slice(1)}`;

  const code = COUNTRY_DIAL_CODES[String(lead?.country || '').toLowerCase().trim()];
  if (code === '1' && digits.length === 10) return `1${digits}`;
  if (code && code !== '1' && digits.startsWith('0')) return `${code}${digits.slice(1)}`;
  return digits;
};

// A number counts as WhatsApp-capable when the listing itself says so, when it was published as
// a mobile line, or when it is an Egyptian mobile. A landline is never assumed to be one.
export const isWhatsAppLead = (lead) => {
  if (digitsOf(lead?.whatsapp)) return true;
  if (digitsOf(lead?.mobile)) return true;
  return EGYPT_MOBILE.test(digitsOf(lead?.phone));
};

export const leadChannels = (lead) => ({
  email: Boolean(lead?.email),
  whatsapp: isWhatsAppLead(lead),
  website: Boolean(lead?.website),
  social: Boolean(lead?.facebook || lead?.instagram || lead?.linkedin)
});

export const channelCount = (lead) => Object.values(leadChannels(lead)).filter(Boolean).length;
