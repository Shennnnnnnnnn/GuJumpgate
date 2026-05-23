const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/cockpit-tools-session-import.js', 'utf8');

function loadApi() {
  const scope = {};
  return new Function('self', `${source}; return self.MultiPageBackgroundCockpitToolsSessionImport;`)(scope);
}

function createJwt(expiresAtSeconds) {
  const payload = Buffer.from(JSON.stringify({ exp: expiresAtSeconds })).toString('base64url');
  return `header.${payload}.signature`;
}

test('cockpit-tools session helper detects expired session access tokens', () => {
  const executor = loadApi().createCockpitToolsSessionImportExecutor();
  const now = Math.floor(Date.now() / 1000);

  assert.equal(executor.isSessionAccessTokenExpired({ accessToken: createJwt(now - 60) }), true);
  assert.equal(executor.isSessionAccessTokenExpired({ accessToken: createJwt(now + 3600) }), false);
  assert.equal(executor.isSessionAccessTokenExpired({ session: { accessToken: createJwt(now - 60) } }), true);
});

test('cockpit-tools session helper builds import, list, and delete bridge endpoints', () => {
  const executor = loadApi().createCockpitToolsSessionImportExecutor();

  assert.equal(executor.buildCockpitToolsImportEndpoints()[0], 'http://127.0.0.1:19528/v1/codex/accounts/import');
  assert.equal(executor.buildCockpitToolsListEndpoints()[0], 'http://127.0.0.1:19528/v1/codex/accounts');
  assert.equal(executor.buildCockpitToolsDeleteEndpoints()[0], 'http://127.0.0.1:19528/v1/codex/accounts/delete');
});
