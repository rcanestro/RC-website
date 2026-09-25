# Secure contact form deployment

This repository contains both halves of the contact-form change:

- `index.html` — renders Cloudflare Turnstile and sends its short-lived token with the form data.
- `apps-script/Code.gs` — validates the token **server-side** before it sends mail; also validates input, escapes email HTML, retains the honeypot, and applies conservative rate limits.

## Required one-time configuration

Do **not** merge/deploy the frontend until these steps are complete. The placeholder site key intentionally disables the form, rather than exposing the unprotected endpoint again.

### 1. Create Cloudflare Turnstile credentials

1. In the Cloudflare dashboard, open **Turnstile** → **Add site**.
2. Add both hostnames: `ryancanestro.com` and `www.ryancanestro.com`.
3. Use the managed widget type.
4. Copy the **site key** and replace `REPLACE_WITH_TURNSTILE_SITE_KEY` in `index.html`.
5. Keep the **secret key** private. It must never be committed to this repository or placed in the HTML.

### 2. Replace the Apps Script code and set its private properties

1. Open the Google Apps Script project that owns the currently published `/exec` URL.
2. Replace its server code with `apps-script/Code.gs`.
3. In **Project Settings** → **Script properties**, add:

   | Property | Value |
   | --- | --- |
   | `CONTACT_RECIPIENT` | the Gmail address that should receive messages |
   | `TURNSTILE_SECRET` | the Turnstile secret key from step 1 |
   | `ALLOWED_HOSTNAME` | `www.ryancanestro.com` |

4. Deploy a **new version** as a Web app, executed as the script owner and accessible to **Anyone**. Copy its `/exec` URL if it changed and update `SCRIPT_URL` in `index.html`.

The public web-app URL is expected: it is safe only because `Code.gs` verifies each one-time Turnstile token before sending email. Do not rely on CORS, a hidden field, or an unguessable URL as access control.

### 3. Deploy and test

1. Merge the frontend only after the server version is deployed with its Script Properties set.
2. Visit the site in a private browser window; complete the Turnstile challenge and submit one harmless test message.
3. Confirm exactly one email arrives and the Apps Script **Executions** page reports a successful run.
4. Attempt a direct POST with no Turnstile token only if you are using a controlled test client; it must not result in an email. Do not use production spam tests.

## Security behavior

- Turnstile tokens are verified server-side against `www.ryancanestro.com`.
- The server rejects malformed/oversized fields, control characters, and a filled honeypot.
- User data is HTML-escaped before it appears in the email.
- The sender-supplied email is informational only; it is not made a mail recipient or reply-to address.
- Rate limiting is intentionally conservative: one accepted submission per email hash per five minutes, and up to 40 accepted submissions per ten-minute global window.

## Local verification

```bash
node --test tests/contact-security.test.mjs
git diff --check
python3 -m http.server 4173 --bind 127.0.0.1
```

The automated tests are source-level safety contracts. They do not replace the live end-to-end check after the Turnstile credentials and Apps Script deployment are configured.
