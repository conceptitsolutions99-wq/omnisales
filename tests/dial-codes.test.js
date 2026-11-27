// The dial codes and the Egyptian number rule live in one module, so the form's prefill, its
// validation and the WhatsApp link cannot drift apart.
const test = require('node:test');
const assert = require('node:assert/strict');

const codes = () => import('../src/lib/dial-codes.mjs');
const phones = () => import('../src/lib/manual-phone.mjs');

test('one table holds the codes the form offers', async () => {
  const { DIAL_CODES, dialCodeFor, dialCodeLabel, KNOWN_DIAL_CODES } = await codes();

  assert.equal(dialCodeFor('Canada'), '1');
  assert.equal(dialCodeFor('usa'), '1');
  assert.equal(dialCodeFor(' Egypt '), '20');
  assert.equal(dialCodeLabel('Egypt'), '+20');
  assert.equal(dialCodeFor('Nowhere'), '');
  assert.equal(dialCodeLabel('Nowhere'), '');

  // Every code in the table is offered for matching, longest first so +971 is not read as +9
  assert.deepEqual(
    KNOWN_DIAL_CODES,
    [...new Set(Object.values(DIAL_CODES))].sort((a, b) => b.length - a.length)
  );
  assert.ok(KNOWN_DIAL_CODES.every((entry, index) => index === 0 || KNOWN_DIAL_CODES[index - 1].length >= entry.length));
});

test('the form builds and validates numbers from the same codes', async () => {
  const { dialCodeFor } = await codes();
  const { manualPhoneFor } = await phones();

  const numbers = { Canada: '4165550192', USA: '2125550123', Egypt: '1012345678' };
  for (const [country, national] of Object.entries(numbers)) {
    const code = dialCodeFor(country);
    const result = manualPhoneFor(`+${code} ${national}`, country);
    assert.equal(result.ok, true, `${country} accepts its own code`);
    assert.equal(result.phone, `+${code}${national}`);
  }
});

test('the Egyptian trunk zero and mobile pattern are shared rules', async () => {
  const { EGYPT_MOBILE, stripTrunkZero } = await codes();
  const { manualPhoneFor } = await phones();

  assert.equal(stripTrunkZero('01012345678'), '1012345678');
  assert.equal(stripTrunkZero('0223456789'), '223456789');
  assert.equal(stripTrunkZero('4165550192'), '4165550192');

  assert.equal(EGYPT_MOBILE.test('01012345678'), true);
  assert.equal(EGYPT_MOBILE.test('01512345678'), true);
  assert.equal(EGYPT_MOBILE.test('01312345678'), false);
  assert.equal(EGYPT_MOBILE.test('0223456789'), false);

  // The form uses that rule, so the saved number is the international form WhatsApp needs
  assert.equal(manualPhoneFor('+20 010 1234 5678', 'Egypt').phone, '+201012345678');
});
