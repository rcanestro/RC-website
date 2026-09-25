import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const site = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appScript = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

test('contact form sends a Turnstile token with the request', () => {
  assert.match(site, /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
  assert.match(site, /turnstileToken/);
  assert.match(site, /turnstile\.render/);
});

test('contact form limits client-side field sizes and disables direct submit without Turnstile', () => {
  assert.match(site, /maxLength=\{80\}/);
  assert.match(site, /maxLength=\{254\}/);
  assert.match(site, /maxLength=\{120\}/);
  assert.match(site, /maxLength=\{4000\}/);
  assert.match(site, /disabled=\{status === 'sending' \|\| !turnstileToken\}/);
});

test('Apps Script verifies Turnstile before sending and validates input server-side', () => {
  assert.match(appScript, /siteverify/);
  assert.match(appScript, /verifyTurnstile_/);
  assert.match(appScript, /validatePayload_/);
  assert.match(appScript, /LockService\.getScriptLock/);
  assert.match(appScript, /escapeHtml_/);
  assert.match(appScript, /ScriptProperties/);
  assert.doesNotMatch(appScript, /replyTo:\s*payload\.email/);
});
