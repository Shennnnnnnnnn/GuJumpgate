const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');
const backgroundSource = fs.readFileSync('background.js', 'utf8');

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

test('5sim default country priority starts with Brazil then Chile', () => {
  assert.match(source, /const DEFAULT_FIVE_SIM_COUNTRY_ORDER = Object\.freeze\(\['brazil', 'chile'\]\)/);
  assert.match(source, /const DEFAULT_FIVE_SIM_COUNTRY_ID = 'brazil'/);
  assert.match(source, /id: 'brazil', chn: '巴西', eng: 'Brazil'/);
  assert.match(source, /id: 'chile', chn: '智利', eng: 'Chile'/);
});

test('HeroSMS default country priority starts with Brazil then Chile and migrates legacy Thailand default', () => {
  assert.match(source, /const DEFAULT_HERO_SMS_COUNTRY_ID = 73/);
  assert.match(source, /const DEFAULT_HERO_SMS_COUNTRY_LABEL = 'Brazil'/);
  assert.match(source, /const DEFAULT_HERO_SMS_COUNTRY_FALLBACK = Object\.freeze\(\[\s*\{\s*id: 151,\s*label: 'Chile'\s*\}/);
  assert.match(source, /id: 73, chn: '巴西', eng: 'Brazil'/);
  assert.match(source, /id: 151, chn: '智利', eng: 'Chile'/);
  assert.match(source, /function getRestoredHeroSmsCountrySelection/);
  assert.match(backgroundSource, /function shouldMigrateLegacyHeroSmsDefaultCountrySelection/);
  assert.match(backgroundSource, /normalizedInput\.heroSmsCountryFallback = \[\.\.\.DEFAULT_HERO_SMS_COUNTRY_FALLBACK\]/);
});
