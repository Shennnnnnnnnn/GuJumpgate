const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/submit-signup-email.js', 'utf8');

function loadApi() {
  const scope = {};
  return new Function('self', `${source}; return self.MultiPageBackgroundStep2;`)(scope);
}

test('step 2 reopens official signup entry directly when auth login has no signup entry', async () => {
  const api = loadApi();
  const calls = [];
  const logs = [];
  const completed = [];
  let submitAttempts = 0;

  const executor = api.createStep2Executor({
    addLog: async (message, level) => {
      logs.push({ message, level });
    },
    chrome: {
      tabs: {
        update: async (tabId, details) => {
          calls.push(['tabs.update', tabId, details]);
        },
        get: async (tabId) => ({ id: tabId, url: 'https://chatgpt.com/auth/login' }),
      },
    },
    completeNodeFromBackground: async (nodeId, payload) => {
      completed.push({ nodeId, payload });
    },
    ensureContentScriptReadyOnTab: async () => {},
    ensureSignupAuthEntryPageReady: async () => {
      calls.push(['ensureSignupAuthEntryPageReady']);
      return { tabId: 22 };
    },
    ensureSignupEntryPageReady: async (step) => {
      calls.push(['ensureSignupEntryPageReady', step]);
      return { tabId: 33 };
    },
    ensureSignupPostEmailPageReadyInTab: async (tabId, step) => {
      calls.push(['ensureSignupPostEmailPageReadyInTab', tabId, step]);
      return { state: 'password_page', url: 'https://chatgpt.com/auth/signup/password' };
    },
    getTabId: async () => 11,
    isTabAlive: async () => true,
    resolveSignupEmailForFlow: async () => 'person@example.com',
    sendToContentScriptResilient: async (target, message) => {
      calls.push(['sendToContentScriptResilient', target, message.type, message.nodeId || '']);
      if (message.type === 'ENSURE_SIGNUP_ENTRY_READY') {
        return { state: '' };
      }
      if (message.nodeId === 'submit-signup-email') {
        submitAttempts += 1;
        if (submitAttempts === 1) {
          return {
            error: '当前页面没有可用的注册入口，也不在邮箱/密码页。URL: https://chatgpt.com/auth/login',
          };
        }
        return { state: 'password_page', url: 'https://chatgpt.com/auth/signup/password' };
      }
      return {};
    },
    SIGNUP_PAGE_INJECT_FILES: [],
    waitForTabStableComplete: async () => {},
  });

  await executor.executeStep2({});

  assert.equal(submitAttempts, 2);
  assert.equal(calls.some(([name]) => name === 'ensureSignupAuthEntryPageReady'), false);
  assert.deepEqual(
    calls.filter(([name]) => name === 'ensureSignupEntryPageReady'),
    [['ensureSignupEntryPageReady', 2]]
  );
  assert.match(
    logs.map((entry) => entry.message).join('\n'),
    /当前停留在 ChatGPT 登录页且未找到注册入口，正在重新打开官网入口后重试一次/
  );
  assert.equal(completed[0].nodeId, 'submit-signup-email');
  assert.equal(completed[0].payload.email, 'person@example.com');
});
