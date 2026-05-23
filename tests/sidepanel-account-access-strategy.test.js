const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

test('sidepanel does not force cockpit-tools account access strategy to session json', () => {
  assert.equal(source.includes("exportTarget === COCKPIT_TOOLS_PANEL_MODE\n      ? ACCOUNT_ACCESS_STRATEGY_UI_SESSION_JSON"), false);
  assert.equal(source.includes("nextExportTarget === COCKPIT_TOOLS_PANEL_MODE && selectAccountAccessStrategy"), false);
  assert.equal(source.includes("getSelectedExportTarget() === COCKPIT_TOOLS_PANEL_MODE"), false);
});

test('sidepanel maps cockpit-tools session strategy back to the session json UI value', () => {
  assert.match(
    source,
    /effectivePlusAccountAccessStrategy === PLUS_ACCOUNT_ACCESS_STRATEGY_COCKPIT_TOOLS_SESSION[\s\S]*\? ACCOUNT_ACCESS_STRATEGY_UI_SESSION_JSON/
  );
});
