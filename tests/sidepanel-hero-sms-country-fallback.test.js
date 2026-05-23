const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

test('HeroSMS country loading falls back without noisy console errors', () => {
  assert.equal(source.includes("console.warn('加载 HeroSMS 国家列表失败：'"), false);
  assert.equal(source.includes("console.error('加载 HeroSMS 国家列表失败：'"), false);
  assert.match(source, /Object\.values\(payload\)/);
  assert.match(source, /catch\s*\{\s*const fallbackItems = HERO_SMS_FALLBACK_COUNTRY_ITEMS/);
  assert.match(source, /applyOptions\(fallbackItems,\s*selectHeroSmsCountry\)/);
  assert.match(source, /applyOptions\(fallbackItems,\s*selectHeroSmsCountryFallback\)/);
});
