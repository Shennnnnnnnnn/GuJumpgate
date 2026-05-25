const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/phone-verification-flow.js', 'utf8');

test('HeroSMS price planning applies both minimum and maximum bounds', () => {
  assert.match(
    source,
    /filterPriceCandidatesWithinRange\(\s*mergedCandidates,\s*userMinLimit,\s*userLimit\s*\)/
  );
  assert.match(source, /noAvailableWithinRange:\s*true/);
});

test('HeroSMS activation does not drop user price bounds on network retry', () => {
  assert.match(source, /const hasUserPriceBounds = userLimit !== null \|\| userMinLimit !== null;/);
  assert.match(
    source,
    /&& !hasUserPriceBounds\s*&& isNetworkFetchFailure\(error\)/
  );
});

test('phone code polling marks a number unusable after 12 unsuccessful polls', () => {
  assert.match(source, /const PHONE_CODE_UNAVAILABLE_AFTER_POLL_ROUNDS = 12;/);
  assert.match(source, /reason:\s*`sms_timeout_after_\$\{PHONE_CODE_UNAVAILABLE_AFTER_POLL_ROUNDS\}_polls`/);
  assert.match(source, /判定手机号不可用并更换号码/);
});

test('signup phone code timeout marks current number unusable without resend window', () => {
  assert.match(
    source,
    /if \(purpose === 'signup'\) \{\s*await clearPhoneRuntimeCountdown\(\);\s*throw buildPhoneCodeTimeoutError\(\s*`\$\{normalizedActivation\.phoneNumber\} 在 \$\{waitSeconds\} 秒内未收到短信，判定手机号不可用。`\s*\);\s*\}\s*if \(windowIndex < timeoutWindows\) \{\s*await addLog\(\s*`步骤 \$\{visibleStep\}：\$\{normalizedActivation\.phoneNumber\} 在 \$\{waitSeconds\} 秒内未收到短信，准备请求重发。`/
  );
});
