/**
 * Secure contact-form backend for Google Apps Script.
 *
 * Script properties required before deployment:
 * - CONTACT_RECIPIENT: inbox that receives contact mail
 * - TURNSTILE_SECRET: Cloudflare Turnstile secret key (never put this in index.html)
 * - ALLOWED_HOSTNAMES: allowed domain hostnames, comma-separated
 *
 * Deploy as a Web App: execute as the script owner; who has access: Anyone.
 * The web-app URL is intentionally public. Every accepted request must carry a
 * valid Turnstile token, verified here before mail is sent.
 */
const LIMITS = Object.freeze({
  name: 80,
  email: 254,
  subject: 120,
  message: 4000,
  minFormAgeMs: 2500,
  perEmailWindowSeconds: 300,
  globalWindowSeconds: 600,
  globalLimit: 40,
});

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    validatePayload_(payload);
    verifyTurnstile_(payload.turnstileToken);
    enforceRateLimits_(payload.email);
    sendContactEmail_(payload);
    return json_({ ok: true });
  } catch (error) {
    console.warn(`Contact form rejected: ${error.message}`);
    // Do not disclose validation/rate-limit details to automated callers.
    return json_({ ok: false, error: 'Unable to accept this message.' });
  }
}

function parsePayload_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    throw new Error('Missing request body');
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (_) {
    throw new Error('Invalid JSON');
  }
}

function validatePayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid payload');
  }
  if (payload.website_hp) throw new Error('Honeypot filled');
  if (!payload.turnstileToken || typeof payload.turnstileToken !== 'string') {
    throw new Error('Missing Turnstile token');
  }
  const now = Date.now();
  if (!Number.isSafeInteger(payload.formStartedAt) ||
      payload.formStartedAt > now || now - payload.formStartedAt < LIMITS.minFormAgeMs ||
      now - payload.formStartedAt > 24 * 60 * 60 * 1000) {
    throw new Error('Invalid form age');
  }

  for (const [field, limit] of Object.entries({
    name: LIMITS.name,
    email: LIMITS.email,
    subject: LIMITS.subject,
    message: LIMITS.message,
  })) {
    if (typeof payload[field] !== 'string') throw new Error(`Invalid ${field}`);
    payload[field] = payload[field].trim();
    if (!payload[field] || payload[field].length > limit || /[\u0000-\u001F\u007F]/.test(payload[field])) {
      throw new Error(`Invalid ${field}`);
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    throw new Error('Invalid email');
  }
}

function verifyTurnstile_(token) {
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty('TURNSTILE_SECRET');
  const allowedHostnames = properties.getProperty('ALLOWED_HOSTNAMES');
  if (!secret || !allowedHostnames) throw new Error('Server is not configured');

  const response = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: { secret, response: token },
    muteHttpExceptions: true,
  });
  let verification;
  try {
    verification = JSON.parse(response.getContentText());
  } catch (_) {
    throw new Error('Turnstile verification response was invalid');
  }
  if (!verification.success || !isAllowedHostname_(verification.hostname, allowedHostnames)) {
    throw new Error('Turnstile verification failed');
  }
}

function isAllowedHostname_(hostname, allowedHostnames) {
  return allowedHostnames.split(',').map((value) => value.trim().toLowerCase()).includes(String(hostname).toLowerCase());
}

function enforceRateLimits_(email) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Server busy');
  try {
    const cache = CacheService.getScriptCache();
    const emailKey = `contact-email:${hash_(email.toLowerCase())}`;
    if (cache.get(emailKey)) throw new Error('Rate limit reached');

    const globalKey = 'contact-global-window';
    const count = Number(cache.get(globalKey) || 0);
    if (count >= LIMITS.globalLimit) throw new Error('Rate limit reached');
    cache.put(emailKey, '1', LIMITS.perEmailWindowSeconds);
    cache.put(globalKey, String(count + 1), LIMITS.globalWindowSeconds);
  } finally {
    lock.releaseLock();
  }
}

function sendContactEmail_(payload) {
  const recipient = PropertiesService.getScriptProperties().getProperty('CONTACT_RECIPIENT');
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error('Server is not configured');
  }
  const subject = `[Website contact] ${payload.subject}`;
  const plainText = [
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    '',
    payload.message,
  ].join('\n');
  const htmlBody = `<p><strong>Name:</strong> ${escapeHtml_(payload.name)}<br>` +
    `<strong>Email:</strong> ${escapeHtml_(payload.email)}</p>` +
    `<p>${escapeHtml_(payload.message).replace(/\n/g, '<br>')}</p>`;

  MailApp.sendEmail({ to: recipient, subject, body: plainText, htmlBody, name: 'RyanCanestro.com Contact Form' });
}

function hash_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value);
  return bytes.map((byte) => (`0${(byte & 0xFF).toString(16)}`).slice(-2)).join('');
}

function escapeHtml_(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
