const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const createSource = fs.readFileSync('background/steps/create-plus-checkout.js', 'utf8');
const contentSource = fs.readFileSync('content/plus-checkout.js', 'utf8');

test('hosted checkout phone signup uses current Outlook/Hotmail email before random fallback', () => {
  assert.match(createSource, /function resolveHostedCheckoutEmail\(state = \{\}\)/);
  assert.match(createSource, /signupMethod === 'phone'/);
  assert.match(createSource, /accountIdentifierType === 'phone'/);
  assert.match(createSource, /registrationEmailState\.current/);
  assert.match(createSource, /getCurrentHotmailAccountEmail\(state\)/);
  assert.match(createSource, /hotmailEmail/);
  assert.match(createSource, /outlookEmail/);
  assert.match(createSource, /candidates\.find\(Boolean\) \|\| buildHostedCheckoutRandomEmail\(\)/);
});

test('hosted checkout OpenAI page fills the email input from guest profile', () => {
  assert.match(contentSource, /function fillHostedOpenAiEmail\(email = ''\)/);
  assert.match(contentSource, /'#email'/);
  assert.match(contentSource, /'input\[name="email"\]'/);
  assert.match(contentSource, /'input\[autocomplete="email"\]'/);
  assert.match(contentSource, /fillHostedOpenAiEmail\(payload\.email\)/);
  assert.match(createSource, /payload:\s*\{[\s\S]*address: guestProfile\.address,[\s\S]*email: guestProfile\.email/);
});
