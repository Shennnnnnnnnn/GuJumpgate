const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createElement(options = {}) {
  const attrs = { ...(options.attrs || {}) };
  return {
    disabled: Boolean(options.disabled),
    hidden: Boolean(options.hidden),
    id: options.id || '',
    textContent: options.textContent || '',
    value: options.value || '',
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    getBoundingClientRect() {
      return options.rect || { width: 100, height: 24, left: 0, top: 0 };
    },
    click() {
      this.clicked = true;
    },
    dispatchEvent(event) {
      this.dispatchedEvents = [...(this.dispatchedEvents || []), event?.type || 'unknown'];
      return true;
    },
  };
}

function loadPayPalFlowContext(options = {}) {
  const withVerification = options.withVerification !== false;
  const verificationInputs = withVerification ? Array.from({ length: 6 }, (_, index) => createElement({
    id: `ci-ciBasic-${index}`,
  })) : [];
  const alert = createElement({
    attrs: { role: 'alert' },
    textContent: 'Sorry, something went wrong. Get a new code.',
  });
  const limitedMessage = createElement({
    attrs: { class: 'message' },
    textContent: options.messageText || 'Your account is limited. Please check your PayPal Account Overview page for information on how to resolve this problem.',
  });
  const resendButton = createElement({
    attrs: { 'data-testid': 'resend-link' },
    textContent: 'Resend',
  });
  const bodyText = options.bodyText
    || (withVerification
      ? 'Sorry, something went wrong. Get a new code. Resend'
      : limitedMessage.textContent);
  const documentElement = createElement();
  const document = {
    readyState: 'complete',
    body: {
      innerText: bodyText,
    },
    documentElement,
    getElementById(id) {
      return verificationInputs.find((input) => input.id === id) || null;
    },
    querySelector(selector) {
      if (selector === 'button[data-testid="resend-link"]') {
        return withVerification ? resendButton : null;
      }
      if (selector === 'p.message') return withVerification ? null : limitedMessage;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[role="alert"]') {
        return withVerification ? [alert] : [];
      }
      if (selector.includes('button') || selector.includes('[role="button"]')) {
        return withVerification ? [resendButton] : [];
      }
      if (selector === 'input') {
        return verificationInputs;
      }
      if (selector === 'p.message, .message') {
        return withVerification ? [] : [limitedMessage];
      }
      return [];
    },
  };
  const context = {
    console: { log() {} },
    chrome: { runtime: { onMessage: { addListener() {} } } },
    document,
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    location: { href: 'https://www.paypal.com/pay', host: 'www.paypal.com', pathname: '/pay' },
    MouseEvent: class MouseEvent {
      constructor(type) {
        this.type = type;
      }
    },
    MutationObserver: class MutationObserver {
      observe() {}
      disconnect() {}
    },
    PointerEvent: class PointerEvent {
      constructor(type) {
        this.type = type;
      }
    },
    setTimeout() {},
    sleep: async () => {},
    throwIfStopped() {},
    window: {
      getComputedStyle() {
        return { display: 'block', visibility: 'visible', opacity: '1' };
      },
    },
  };
  context.globalThis = context;
  context.window.window = context.window;
  context.window.globalThis = context;
  context.window.document = document;
  context.window.location = context.location;
  context.window.setTimeout = context.setTimeout;
  context.window.Event = context.Event;
  context.window.MouseEvent = context.MouseEvent;
  context.window.PointerEvent = context.PointerEvent;
  const source = fs.readFileSync(path.join(__dirname, '..', 'content', 'paypal-flow.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'content/paypal-flow.js' });
  return { context, resendButton };
}

test('PayPal hosted verification state exposes error alert and resend button', () => {
  const { context } = loadPayPalFlowContext();
  const state = context.inspectPayPalState();

  assert.equal(state.hostedStage, 'verification');
  assert.equal(state.verificationErrorVisible, true);
  assert.equal(state.verificationResendVisible, true);
  assert.match(state.verificationErrorText, /something went wrong/i);
});

test('PayPal hosted verification resend command clicks the resend control', async () => {
  const { context, resendButton } = loadPayPalFlowContext();
  const result = await context.runHostedCheckoutStep({ resendVerification: true });

  assert.equal(result.resendClicked, true);
  assert.ok(resendButton.dispatchedEvents.includes('click'));
});

test('PayPal hosted state exposes limited account message', () => {
  const { context } = loadPayPalFlowContext({ withVerification: false });
  const state = context.inspectPayPalState();

  assert.equal(state.payPalAccountLimitedVisible, true);
  assert.match(state.payPalAccountLimitedText, /account is limited/i);
});

test('PayPal hosted state exposes temporary checkout failure as terminal state', () => {
  const { context } = loadPayPalFlowContext({
    withVerification: false,
    messageText: 'Things don’t appear to be working at the moment.',
  });
  const state = context.inspectPayPalState();

  assert.equal(state.payPalTemporaryFailureVisible, true);
  assert.match(state.payPalTemporaryFailureText, /things/i);
});
