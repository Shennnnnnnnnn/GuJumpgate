const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');
const signupHelpersSource = fs.readFileSync('background/signup-flow-helpers.js', 'utf8');
const messageRouterSource = fs.readFileSync('background/message-router.js', 'utf8');

test('Hotmail polling allows current account mailbox access before authorized status', () => {
  assert.match(source, /function canAttemptHotmailMailboxAccess\(candidate\)/);
  assert.match(
    source,
    /allowUsedCurrent\s*\?\s*canAttemptHotmailMailboxAccess\(account\)/
  );
});

test('Hotmail not-ready error reports a concrete readiness reason', () => {
  assert.match(source, /缺少刷新令牌/);
  assert.match(source, /当前状态为 \$\{candidate\.status \|\| 'unknown'\}/);
});

test('Hotmail account allocation does not mark the account used before flow completion', () => {
  const autoReadyBlocks = source.match(/const account = await ensureHotmailAccountForFlow\(\{[\s\S]*?\n    \}\);/g) || [];
  assert.ok(autoReadyBlocks.some((block) => /markUsed:\s*false/.test(block)));
  assert.match(
    signupHelpersSource,
    /ensureHotmailAccountForFlow\(\{[\s\S]*?markUsed:\s*false[\s\S]*?preferredAccountId: state\.currentHotmailAccountId/
  );
  assert.equal(messageRouterSource.includes('步骤 5 完成：当前 Hotmail 账号已标记为已用。'), false);
  assert.equal(/stepKey === 'fill-profile'[\s\S]*?markCurrentRegistrationAccountUsed/.test(messageRouterSource), false);
});
