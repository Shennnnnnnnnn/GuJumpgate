const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const panelBridgeSource = fs.readFileSync('background/panel-bridge.js', 'utf8');
const platformVerifySource = fs.readFileSync('background/steps/platform-verify.js', 'utf8');

function loadPanelBridgeApi() {
  const scope = {};
  return new Function('self', `${panelBridgeSource}; return self.MultiPageBackgroundPanelBridge;`)(scope);
}

function loadPlatformVerifyApi() {
  const scope = {};
  return new Function('self', `${platformVerifySource}; return self.MultiPageBackgroundStep10;`)(scope);
}

test('cockpit-tools OAuth mode generates a local PKCE authorization request', async () => {
  const api = loadPanelBridgeApi();
  const bridge = api.createPanelBridge({
    addLog: async () => {},
    createLocalCliProxyApi: () => ({
      createAuthorizationRequest: async () => ({
        oauthUrl: 'https://auth.openai.com/oauth/authorize?state=cockpit-state',
        oauthState: 'cockpit-state',
        pkceCodes: {
          codeVerifier: 'verifier',
          codeChallenge: 'challenge',
        },
      }),
    }),
    getPanelMode: () => 'cockpit-tools',
  });

  const result = await bridge.requestOAuthUrlFromPanel({ panelMode: 'cockpit-tools' });

  assert.equal(result.oauthUrl, 'https://auth.openai.com/oauth/authorize?state=cockpit-state');
  assert.equal(result.cockpitToolsOAuthState, 'cockpit-state');
  assert.deepEqual(result.cockpitToolsPkceCodes, {
    codeVerifier: 'verifier',
    codeChallenge: 'challenge',
  });
});

test('cockpit-tools OAuth platform verify exchanges the callback and imports tokens', async () => {
  const api = loadPlatformVerifyApi();
  const fetchCalls = [];
  const completed = [];
  const executor = api.createStep10Executor({
    addLog: async () => {},
    completeNodeFromBackground: async (nodeId, payload) => completed.push({ nodeId, payload }),
    createLocalCliProxyApi: () => ({
      exchangeCodeForTokens: async (options) => {
        assert.equal(options.code, 'oauth-code');
        assert.equal(options.pkceCodes.codeVerifier, 'verifier');
        return {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          idToken: 'id-token',
          expiresAt: '2026-01-01T00:00:00.000Z',
        };
      },
    }),
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, account: { email: 'user@example.com' } }),
      };
    },
    getPanelMode: () => 'cockpit-tools',
    isLocalhostOAuthCallbackUrl: () => true,
  });

  await executor.executeStep10({
    nodeId: 'platform-verify',
    localhostUrl: 'http://127.0.0.1:1455/callback?code=oauth-code&state=cockpit-state',
    cockpitToolsOAuthState: 'cockpit-state',
    cockpitToolsPkceCodes: { codeVerifier: 'verifier', codeChallenge: 'challenge' },
  });

  assert.equal(fetchCalls[0].url, 'http://127.0.0.1:19528/v1/codex/accounts/import');
  assert.equal(fetchCalls[0].options.method, 'POST');
  const body = JSON.parse(fetchCalls[0].options.body);
  assert.deepEqual(body.payload.tokens, {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    id_token: 'id-token',
  });
  assert.equal(completed[0].payload.destination, 'cockpit-tools');
  assert.equal(completed[0].payload.verifiedStatus, 'cockpit-tools OAuth 账号导入成功');
});
