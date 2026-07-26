# Google Apps Script email relay

QuranTrack uses the Google Apps Script relay in `apps-script-mail-relay/`. The Worker resolves every message's sender server-side:

- `MAIL_DEFAULT_FROM_ALIAS` is the verified deployment default and must also occur in the comma-separated `MAIL_APPROVED_FROM_ALIASES` allowlist.
- An organization's nullable `email_sender_alias` is used only after trimming, lowercasing, address validation, and an exact allowlist match. Invalid or unapproved overrides fall back to the default.
- `email_sender_name` supplies the display name and `email_reply_to` supplies Reply-To. Reply-To is never used as From.
- A missing, malformed, or unapproved default stops delivery safely. The login API still returns its generic eligibility response.

No deployment address belongs in source control. Keep environment-specific addresses in Worker configuration and mirror the approved list in the Apps Script `APPROVED_SENDER_ALIASES` script property.

## Signed protocol and relay controls

Apps Script web apps cannot reliably expose arbitrary request headers to `doPost(e)`, so the Worker sends `timestamp`, `nonce`, and `signature` as query parameters. The POST body is the exact JSON message. The signature is HMAC-SHA-256 over `timestamp.nonce.body`.

The relay preserves the five-minute timestamp window, nonce replay cache, and HMAC verification. It safely rejects malformed JSON, missing/invalid fields, oversized recipients/subjects/bodies, invalid sender names or Reply-To values, and unauthorized senders with structured `{ "ok": false, "error": "..." }` JSON. The Worker treats anything except `{ "ok": true }` as failure.

The executing Google account is accepted as the primary sender without requiring it in `GmailApp.getAliases()`, but it must be explicitly approved. Every additional From alias must both be explicitly approved and appear in `GmailApp.getAliases()`. An explicitly requested unauthorized alias is rejected rather than substituted. Do not log bodies, recipients, links, tokens, nonces, signatures, or secrets.

## Post-merge staging configuration (manual)

Do not perform these steps from this change:

1. Apply migration `0002_organization_email_sender_alias.sql` to staging with `npm run db:migrate:staging`.
2. Verify `<STAGING_SENDER_ADDRESS>` in the Gmail account that deploys the relay (or use that deploying account itself).
3. Set Apps Script properties `MAIL_RELAY_SECRET=<SHARED_RANDOM_SECRET>` and `APPROVED_SENDER_ALIASES=<STAGING_SENDER_ADDRESS>[,<VERIFIED_ORG_ALIAS>...]`.
4. Deploy the reviewed Apps Script as a Web App executing as the deploying account. Set Worker secret `MAIL_RELAY_SECRET` and relay URL `MAIL_RELAY_URL` through the operator's secret/configuration workflow.
5. Set Worker variables `MAIL_DEFAULT_FROM_ALIAS=<STAGING_SENDER_ADDRESS>` and `MAIL_APPROVED_FROM_ALIASES=<STAGING_SENDER_ADDRESS>[,<VERIFIED_ORG_ALIAS>...]`. The two allowlists must agree.
6. If an organization needs an override, update its `email_sender_alias` to `<VERIFIED_ORG_ALIAS>` only after verification and both allowlists are configured; otherwise leave it `NULL`.
7. In the Apps Script editor, run `sendTestEmail`; it can send only to the deploying account. Then request a staging magic link and verify From display name, From address, Reply-To, generic login response, and one-time consumption.

Use placeholders in runbooks and source control; never commit real sender addresses or relay secrets.
