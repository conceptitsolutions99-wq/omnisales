// An unsubscribe link has to work from an email client months later, so the address it carries
// is signed rather than stored: the token is the address plus an HMAC the server can verify.
// Without a secret the links are signed with a random per-process key, which still refuses forged
// tokens but stops old links working after a restart; production sets AUTH_SECRET already.
const crypto = require('node:crypto');

const SECRET =
  process.env.UNSUBSCRIBE_SECRET ||
  process.env.AUTH_SECRET ||
  crypto.randomBytes(32).toString('hex');

const normalise = (email) => String(email || '').trim().toLowerCase();

const signatureFor = (address) =>
  crypto.createHmac('sha256', SECRET).update(address).digest('base64url').slice(0, 32);

const createUnsubscribeToken = (email) => {
  const address = normalise(email);
  if (!address) return '';
  return `${Buffer.from(address, 'utf8').toString('base64url')}.${signatureFor(address)}`;
};

const readUnsubscribeToken = (token) => {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) return '';

  let address = '';
  try {
    address = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch (err) {
    return '';
  }
  address = normalise(address);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return '';

  const expected = signatureFor(address);
  if (signature.length !== expected.length) return '';
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? address : '';
};

module.exports = { createUnsubscribeToken, readUnsubscribeToken, normalise };
