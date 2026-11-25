// One email can carry several requirements forms. Each gets its own link, and the section lists
// them by name so the customer opens the right one for each project.
const test = require('node:test');
const assert = require('node:assert/strict');

const emailForms = require('../lib/requirements-email');

test('one form keeps the original single-link section', () => {
  const section = emailForms.requirementsSection([
    { type: 'website', label: 'Website project requirements', url: 'https://app/#/requirements/tok' }
  ]);

  assert.match(section, /Project requirements form\n/);
  assert.match(section, /https:\/\/app\/#\/requirements\/tok/);
  assert.doesNotMatch(section, /Website project requirements:/);
});

test('several forms are listed by name, each with its own link', () => {
  const section = emailForms.requirementsSection([
    { type: 'website', label: 'Website project requirements', url: 'https://app/#/requirements/aaa' },
    { type: 'mobile', label: 'Mobile app requirements', url: 'https://app/#/requirements/bbb' },
    { type: 'desktop', label: 'Desktop app requirements', url: 'https://app/#/requirements/ccc' }
  ]);

  assert.match(section, /Project requirements forms\n/);
  assert.match(section, /Website project requirements: https:\/\/app\/#\/requirements\/aaa/);
  assert.match(section, /Mobile app requirements: https:\/\/app\/#\/requirements\/bbb/);
  assert.match(section, /Desktop app requirements: https:\/\/app\/#\/requirements\/ccc/);
});

test('no ticked form adds nothing to the email', () => {
  assert.equal(emailForms.requirementsSection([]), '');
  assert.equal(emailForms.requirementsSection(), '');
});

test('types are cleaned, deduplicated and limited to the forms that exist', () => {
  assert.deepEqual(emailForms.cleanTypes(['website', 'mobile', 'website', '', 'nonsense', null]), ['website', 'mobile']);
  assert.deepEqual(emailForms.cleanTypes('desktop'), ['desktop']);
  assert.deepEqual(emailForms.cleanTypes(undefined), []);
});
