const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

test('phone country priority memory uses provider-specific selections', () => {
  assert.match(source, /normalizedProvider === PHONE_SMS_PROVIDER_FIVE_SIM[\s\S]*getSelectedFiveSimCountries/);
  assert.match(source, /normalizedProvider === PHONE_SMS_PROVIDER_NEXSMS[\s\S]*getSelectedNexSmsCountries/);
});

test('switching phone SMS provider persists and restores NexSMS country order', () => {
  assert.match(source, /previousProvider === PHONE_SMS_PROVIDER_NEXSMS[\s\S]*patch\.nexSmsCountryOrder/);
  assert.match(source, /normalizedNextProvider === PHONE_SMS_PROVIDER_NEXSMS[\s\S]*applyNexSmsCountrySelection/);
});

test('settings restore re-applies country priority with provider-specific selectors', () => {
  assert.match(source, /restoredPhoneSmsProvider === PHONE_SMS_PROVIDER_FIVE_SIM[\s\S]*applyFiveSimCountrySelection/);
  assert.match(source, /restoredPhoneSmsProvider === PHONE_SMS_PROVIDER_NEXSMS[\s\S]*applyNexSmsCountrySelection/);
  assert.equal(
    /previousPhoneSmsProvider !== restoredPhoneSmsProvider\)\s*\{\s*heroSmsCountrySelectionOrder = \[\];\s*loadHeroSmsCountries/.test(source),
    false
  );
});
