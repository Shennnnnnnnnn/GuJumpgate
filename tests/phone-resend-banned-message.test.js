const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadPhoneAuthHelpers(messageText) {
  const errorElement = {
    textContent: messageText,
  };
  const form = {
    querySelectorAll(selector) {
      if (selector === '[class*="error"]') {
        return [errorElement];
      }
      return [];
    },
  };
  const context = {
    document: {
      querySelector(selector) {
        if (selector === 'form[action*="/phone-verification" i]') {
          return form;
        }
        return null;
      },
    },
    globalThis: {},
    location: {
      href: 'https://auth.openai.com/phone-verification',
      pathname: '/phone-verification',
    },
    self: {},
  };

  context.globalThis = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('content/phone-auth.js', 'utf8'), context);

  return context.MultiPagePhoneAuth.createPhoneAuthHelpers({
    getPageTextSnapshot: () => messageText,
    getVerificationErrorText: () => '',
  });
}

test('Chinese text-message resend error marks the phone number as banned', () => {
  const helpers = loadPhoneAuthHelpers('无法向此电话号码发送文本消息');
  const result = helpers.checkPhoneResendError();

  assert.equal(result.hasError, true);
  assert.equal(result.reason, 'resend_phone_banned');
  assert.equal(result.prefix, 'PHONE_RESEND_BANNED_NUMBER::');
  assert.equal(result.message, '无法向此电话号码发送文本消息');
});

