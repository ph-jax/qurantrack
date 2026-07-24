# Google Apps Script email relay

QuranTrack uses the free Google Apps Script relay in `apps-script-mail-relay/` instead of a paid email provider.

Worker requests include JSON email content plus `x-qurantrack-timestamp`, `x-qurantrack-nonce`, and `x-qurantrack-signature`. The signature is HMAC-SHA-256 over `timestamp.nonce.body` with `MAIL_RELAY_SECRET`.

The Apps Script deployment rejects expired timestamps, replayed nonces, invalid signatures, and sender aliases not listed in `APPROVED_SENDER_ALIASES`.
