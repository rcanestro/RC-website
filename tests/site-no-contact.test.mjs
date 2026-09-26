import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const site = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('public site exposes no contact form or Turnstile integration', () => {
  assert.doesNotMatch(site, /const ContactForm/);
  assert.doesNotMatch(site, /TURNSTILE_SITE_KEY/);
  assert.doesNotMatch(site, /challenges\.cloudflare\.com\/turnstile/);
  assert.doesNotMatch(site, /Contact Me/);
  assert.doesNotMatch(site, /script\.google\.com\/macros/);
});
