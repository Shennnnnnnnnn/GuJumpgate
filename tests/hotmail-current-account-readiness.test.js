const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');

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
