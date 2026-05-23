const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const createSource = fs.readFileSync('background/steps/create-plus-checkout.js', 'utf8');
const routerSource = fs.readFileSync('background/message-router.js', 'utf8');
const backgroundSource = fs.readFileSync('background.js', 'utf8');
const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

test('hosted checkout verification parser supports nested data.code text responses', () => {
  assert.match(createSource, /payload\?\.data\?\.code/);
  assert.match(createSource, /collectNestedCandidates\(payload,\s*candidates\)/);
  assert.match(createSource, /const match = text\.match\(\/\\d\{6\}\/\)/);
});

test('sidepanel exposes manual checkout link generation through the message router', () => {
  assert.match(html, /id="btn-plus-checkout-generate-link"[\s\S]*生成 checkout 链接/);
  assert.match(sidepanelSource, /const btnPlusCheckoutGenerateLink = document\.getElementById\('btn-plus-checkout-generate-link'\)/);
  assert.match(sidepanelSource, /type:\s*'GENERATE_PLUS_CHECKOUT_LINK'/);
  assert.match(routerSource, /case 'GENERATE_PLUS_CHECKOUT_LINK'/);
  assert.match(routerSource, /generatePlusCheckoutLinkManually\(message\.payload \|\| \{\}\)/);
  assert.match(backgroundSource, /generatePlusCheckoutLinkManually:\s*\(\.\.\.args\) => plusCheckoutCreateExecutor\.generatePlusCheckoutLinkManually\(\.\.\.args\)/);
  assert.match(createSource, /async function generatePlusCheckoutLinkManually\(options = \{\}\)/);
});
