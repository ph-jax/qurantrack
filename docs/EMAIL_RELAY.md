# Google Apps Script email relay

QuranTrack uses the free Google Apps Script relay in `apps-script-mail-relay/` instead of a paid email provider.

Because Google Apps Script web apps cannot reliably expose arbitrary request headers to `doPost(e)`, the Worker sends relay authentication fields as query parameters:

- `timestamp`
- `nonce`
- `signature`

The POST body remains the exact JSON email message. The signature is HMAC-SHA-256 over the canonical string `timestamp.nonce.body`, where `body` is the exact JSON request body sent to Apps Script.

The Worker parses the relay JSON response and treats anything other than `{ "ok": true }` as delivery failure, even when HTTP status is 200.

The Apps Script deployment rejects missing authentication fields, expired timestamps, replayed nonces, invalid signatures, and sender aliases not listed in `APPROVED_SENDER_ALIASES`. Do not log message bodies, email addresses, magic-link URLs, secrets, or raw tokens.
