# QuranTrack Apps Script mail relay

Deploy this Apps Script as a Web App owned by the Gmail or Google Workspace account that sends QuranTrack staff magic-link email.

1. Create a new Apps Script project and copy `Code.gs` and `appsscript.json`.
2. In **Project Settings → Script properties**, set `MAIL_RELAY_SECRET` to the same random secret configured in the Worker and `APPROVED_SENDER_ALIASES` to a comma-separated list of approved addresses. Include the executing account explicitly. Additional addresses must be verified Gmail aliases returned by `GmailApp.getAliases()`.
3. Deploy as **Web app**, execute as yourself, with access limited to the deployment option appropriate for your Google account.
4. Copy the Web App URL into the Worker secret/config `MAIL_RELAY_URL`.
5. Rotate `MAIL_RELAY_SECRET` by setting both Apps Script and Worker secrets before enabling production traffic.
6. Run `sendTestEmail` from the editor. It is intentionally restricted to the executing/deploying account.

For a controlled diagnosis of the production sender/options path, optionally set
`RELAY_TEST_FROM_ALIAS` and `RELAY_TEST_REPLY_TO`, then manually run
`sendControlledRelayTest`. The recipient is always the executing Apps Script account; the
function never reads a guardian recipient. On failure, the execution log contains only the event,
safe stage, and safe category. Remove the temporary test properties after review.

See `docs/EMAIL_RELAY.md` for validation, sender resolution, and exact post-merge staging steps. Never put a real deployment address in source control.

Protocol details:

- The Worker posts the exact JSON email message body.
- The Worker adds `timestamp`, `nonce`, and `signature` as URL query parameters because Apps Script web apps cannot reliably read custom request headers.
- The signature is HMAC-SHA-256 over `timestamp.nonce.body`.
- The relay returns JSON only. The Worker accepts only `{ "ok": true }` as success.

The relay rejects missing authentication fields, stale timestamps, replayed nonces, invalid HMAC signatures, and unapproved sender aliases. Do not log request bodies because they include email addresses and sign-in links.

Changing `Code.gs` requires a new Web App version. Updating the existing deployment to that version
keeps its Web App URL, so `MAIL_RELAY_URL` does not need to change.
