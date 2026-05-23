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

test('cockpit-tools session helper picks a used Outlook account for the registered email alias', () => {
  const executor = loadApi().createCockpitToolsSessionImportExecutor();
  const account = executor.findUsedOutlookAccountForRegisteredEmail({
    hotmailAccounts: [{
      id: 'outlook-1',
      email: 'base@outlook.com',
      status: 'authorized',
      used: true,
      refreshToken: 'refresh-token',
    }],
    hotmailAliasUsage: {
      'outlook-1': {
        aliases: {
          'base+paypal1@outlook.com': {
            email: 'base+paypal1@outlook.com',
            used: true,
          },
        },
      },
    },
  }, 'base+paypal1@outlook.com');

  assert.equal(account.id, 'outlook-1');
  assert.equal(account.email, 'base@outlook.com');
});

test('cockpit-tools session helper does not refresh with errored or unused Outlook accounts', () => {
  const executor = loadApi().createCockpitToolsSessionImportExecutor();
  const state = {
    hotmailAccounts: [
      {
        id: 'unused',
        email: 'unused@outlook.com',
        status: 'authorized',
        used: false,
        refreshToken: 'refresh-token',
      },
      {
        id: 'errored',
        email: 'errored@outlook.com',
        status: 'error',
        used: true,
        refreshToken: 'refresh-token',
      },
    ],
  };

  assert.equal(executor.findUsedOutlookAccountForRegisteredEmail(state, 'unused@outlook.com'), null);
  assert.equal(executor.findUsedOutlookAccountForRegisteredEmail(state, 'errored@outlook.com'), null);
});

test('cockpit-tools session helper treats lastUsedAt as used Outlook state', () => {
  const executor = loadApi().createCockpitToolsSessionImportExecutor();
  const account = executor.findUsedOutlookAccountForRegisteredEmail({
    hotmailAccounts: [{
      id: 'outlook-2',
      email: 'last-used@outlook.com',
      status: 'authorized',
      lastUsedAt: 1710000000000,
      refreshToken: 'refresh-token',
    }],
  }, 'last-used@outlook.com');

  assert.equal(account.id, 'outlook-2');
});

test('cockpit-tools session helper refreshes expired session through used Outlook login callback', async () => {
  const now = Math.floor(Date.now() / 1000);
  let refreshCalls = 0;
  const executor = loadApi().createCockpitToolsSessionImportExecutor({
    refreshSessionByUsedOutlookEmail: async ({ email }) => {
      refreshCalls += 1;
      assert.equal(email, 'user@outlook.com');
      return {
        session: {
          accessToken: createJwt(now + 7200),
          user: { email: 'user@outlook.com' },
          account: { planType: 'plus' },
        },
        capturedAt: Date.now(),
      };
    },
  });

  const refreshed = await executor.refreshSessionIfNeededWithUsedOutlookEmail({
    session: {
      accessToken: createJwt(now - 60),
      user: { email: 'user@outlook.com' },
      account: { planType: 'plus' },
    },
  }, {
    hotmailAccounts: [{
      id: 'outlook-1',
      email: 'user@outlook.com',
      status: 'authorized',
      used: true,
      refreshToken: 'refresh-token',
    }],
  }, 8);

  assert.equal(refreshCalls, 1);
  assert.equal(executor.isSessionAccessTokenExpired(refreshed), false);
});
