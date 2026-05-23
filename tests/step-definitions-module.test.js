const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('data/step-definitions.js', 'utf8');

function loadApi() {
  const scope = {};
  return new Function('self', `${source}; return self.MultiPageStepDefinitions;`)(scope);
}

test('cockpit-tools phone plus flow registers phone before checkout then binds email through OAuth callback', () => {
  const api = loadApi();
  const steps = api.getSteps({
    panelMode: 'cockpit-tools',
    plusModeEnabled: true,
    plusPaymentMethod: 'paypal',
    plusAccountAccessStrategy: api.PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH,
    signupMethod: 'phone',
  });

  assert.deepEqual(
    steps.map((step) => step.key),
    [
      'open-chatgpt',
      'submit-signup-email',
      'fill-password',
      'fetch-signup-code',
      'fill-profile',
      'wait-registration-success',
      'plus-checkout-create',
      'oauth-login',
      'fetch-login-code',
      'bind-email',
      'fetch-bind-email-code',
      'confirm-oauth',
      'platform-verify',
    ]
  );
  assert.equal(steps[1].title, '注册并输入手机号');
  assert.equal(steps[3].title, '获取手机验证码');
  assert.ok(steps.findIndex((step) => step.key === 'wait-registration-success') < steps.findIndex((step) => step.key === 'plus-checkout-create'));
  assert.ok(steps.findIndex((step) => step.key === 'plus-checkout-create') < steps.findIndex((step) => step.key === 'oauth-login'));
  assert.equal(steps.some((step) => step.key === 'cockpit-tools-session-import'), false);
});

test('cockpit-tools email plus flow can choose OAuth instead of session import', () => {
  const api = loadApi();
  const oauthSteps = api.getSteps({
    panelMode: 'cockpit-tools',
    plusModeEnabled: true,
    plusPaymentMethod: 'paypal',
    plusAccountAccessStrategy: api.PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH,
    signupMethod: 'email',
  });
  const sessionSteps = api.getSteps({
    panelMode: 'cockpit-tools',
    plusModeEnabled: true,
    plusPaymentMethod: 'paypal',
    plusAccountAccessStrategy: api.PLUS_ACCOUNT_ACCESS_STRATEGY_COCKPIT_TOOLS_SESSION,
    signupMethod: 'email',
  });

  assert.ok(oauthSteps.some((step) => step.key === 'oauth-login'));
  assert.ok(oauthSteps.some((step) => step.key === 'platform-verify'));
  assert.equal(oauthSteps.some((step) => step.key === 'cockpit-tools-session-import'), false);
  assert.ok(sessionSteps.some((step) => step.key === 'cockpit-tools-session-import'));
  assert.equal(sessionSteps.some((step) => step.key === 'platform-verify'), false);
});
