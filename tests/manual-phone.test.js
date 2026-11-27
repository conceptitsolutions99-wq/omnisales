// A manual lead's phone field opens with the dial code already in it, so the form has to refuse a
// number that is only a dial code, and every saved number has to be in the international form the
// dialler and WhatsApp need.
const test = require('node:test');
const assert = require('node:assert/strict');

const phones = () => import('../src/lib/manual-phone.mjs');

test('the dial code on its own is not a phone number', async () => {
  const { manualPhoneFor } = await phones();

  for (const [typed, country] of [
    ['+1', 'Canada'],
    ['+1 ', 'USA'],
    ['+20', 'Egypt'],
    ['+20 ', 'Egypt'],
    ['', 'Canada']
  ]) {
    const result = manualPhoneFor(typed, country);
    assert.equal(result.ok, false, `"${typed}" is refused`);
    assert.equal(result.phone, '');
    assert.match(result.error, /digits after \+/);
  }
});

test('a number too short after the code is refused with what is missing', async () => {
  const { manualPhoneFor } = await phones();

  const short = manualPhoneFor('+1 (416) 555-01', 'Canada');
  assert.equal(short.ok, false);
  assert.match(short.error, /10 digits after \+1/);

  const egyptShort = manualPhoneFor('+20 010 123', 'Egypt');
  assert.equal(egyptShort.ok, false);
  assert.match(egyptShort.error, /9–10 digits after \+20/);
});

test('a full number keeps its country and loses the separators', async () => {
  const { manualPhoneFor } = await phones();

  assert.deepEqual(manualPhoneFor('+1 (416) 555-0192', 'Canada'), {
    ok: true,
    phone: '+14165550192',
    displayPhone: '+1 4165550192',
    error: ''
  });

  assert.equal(manualPhoneFor('416 555 0192', 'USA').phone, '+14165550192');
  assert.equal(manualPhoneFor('1 416 555 0192', 'Canada').phone, '+14165550192');
});

test('the Egyptian leading zero is dropped so WhatsApp can use the number', async () => {
  const { manualPhoneFor } = await phones();

  for (const typed of ['+20 010 1234 5678', '+20 01012345678', '01012345678', '0101 234 5678']) {
    const result = manualPhoneFor(typed, 'Egypt');
    assert.equal(result.phone, '+201012345678', `"${typed}" is saved internationally`);
    // What the dialler hands WhatsApp: the digits of the stored number, with no trunk zero
    assert.equal(result.phone.replace(/\D/g, ''), '201012345678');
  }

  // A landline keeps its nine digits after the code
  assert.equal(manualPhoneFor('+20 2 2345 6789', 'Egypt').phone, '+20223456789');
});

test('a number that belongs to another country is refused instead of mangled', async () => {
  const { manualPhoneFor } = await phones();

  const result = manualPhoneFor('+20 1012345678', 'Canada');
  assert.equal(result.ok, false);
  assert.match(result.error, /another country/);
});

test('a bare number that starts with the code is not cut when it already fits', async () => {
  const { manualPhoneFor } = await phones();

  // "20 1234 5678" is ten digits for Egypt: reading 20 as the dial code would leave eight
  assert.equal(manualPhoneFor('20 1234 5678', 'Egypt').phone, '+202012345678');
});
