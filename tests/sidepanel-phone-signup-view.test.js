const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

test('sidepanel exposes FlowPilot-style SMS settings and phone signup controls', () => {
  assert.match(html, /<span class="section-label">接码设置<\/span>\s*<span class="data-value">手机号验证与接码服务商获取策略<\/span>/);
  assert.match(html, /id="input-phone-verification-enabled"/);
  assert.match(html, /id="row-signup-method"[\s\S]*data-signup-method="email"[\s\S]*邮箱注册[\s\S]*data-signup-method="phone"[\s\S]*手机号注册/);
  assert.match(html, /id="select-phone-sms-provider"[\s\S]*value="hero-sms"[\s\S]*HeroSMS[\s\S]*value="5sim"[\s\S]*5sim[\s\S]*value="nexsms"[\s\S]*NexSMS/);
});

test('sidepanel wires SMS signup settings into capability and step-definition updates', () => {
  assert.match(sidepanelSource, /phoneVerificationEnabled:\s*phoneEnabled/);
  assert.match(sidepanelSource, /signupMethod:\s*selectedMethod/);
  assert.match(sidepanelSource, /phoneSignupReloginAfterBindEmailEnabled:\s*currentPhoneSignupReloginAfterBindEmailEnabled/);
});
