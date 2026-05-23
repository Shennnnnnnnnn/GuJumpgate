const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('shared/flow-capabilities.js', 'utf8');

function loadApi() {
  const scope = {};
  return new Function('self', `${source}; return self.MultiPageFlowCapabilities;`)(scope);
}

test('cockpit-tools plus mode allows phone signup when SMS settings are enabled', () => {
  const api = loadApi();
  const registry = api.createFlowCapabilityRegistry();

  const capabilityState = registry.resolveSidepanelCapabilities({
    state: {
      activeFlowId: 'openai',
      panelMode: 'cockpit-tools',
      phoneVerificationEnabled: true,
      plusModeEnabled: true,
      contributionMode: false,
      signupMethod: 'phone',
      plusAccountAccessStrategy: api.PLUS_ACCOUNT_ACCESS_STRATEGY_COCKPIT_TOOLS_SESSION,
    },
  });

  assert.equal(capabilityState.canUsePhoneSignup, true);
  assert.equal(capabilityState.canSelectPhoneSignup, true);
  assert.equal(capabilityState.effectiveSignupMethod, 'phone');
  assert.deepEqual(capabilityState.effectiveSignupMethods, ['email', 'phone']);
  assert.equal(capabilityState.effectivePlusAccountAccessStrategy, api.PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH);
  assert.deepEqual(capabilityState.availablePlusAccountAccessStrategies, [api.PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH]);
  assert.equal(capabilityState.stepDefinitionOptions.signupMethod, 'phone');
  assert.equal(capabilityState.stepDefinitionOptions.plusAccountAccessStrategy, api.PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH);
});

test('cockpit-tools plus mode exposes both session and OAuth account access strategies for email signup', () => {
  const api = loadApi();
  const registry = api.createFlowCapabilityRegistry();

  const capabilityState = registry.resolveSidepanelCapabilities({
    state: {
      activeFlowId: 'openai',
      panelMode: 'cockpit-tools',
      phoneVerificationEnabled: true,
      plusModeEnabled: true,
      contributionMode: false,
      signupMethod: 'email',
      plusAccountAccessStrategy: api.PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH,
    },
  });

  assert.equal(capabilityState.canEditPlusAccountAccessStrategy, true);
  assert.equal(capabilityState.effectivePlusAccountAccessStrategy, api.PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH);
  assert.deepEqual(capabilityState.availablePlusAccountAccessStrategies, [
    api.PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH,
    api.PLUS_ACCOUNT_ACCESS_STRATEGY_COCKPIT_TOOLS_SESSION,
  ]);
});

test('non cockpit-tools plus modes still lock phone signup', () => {
  const api = loadApi();
  const registry = api.createFlowCapabilityRegistry();

  const capabilityState = registry.resolveSidepanelCapabilities({
    state: {
      activeFlowId: 'openai',
      panelMode: 'local-cpa-json',
      phoneVerificationEnabled: true,
      plusModeEnabled: true,
      contributionMode: false,
      signupMethod: 'phone',
    },
  });

  assert.equal(capabilityState.canUsePhoneSignup, false);
  assert.equal(capabilityState.effectiveSignupMethod, 'email');
});
