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

Progress messages retain required plain text as the fallback and may include the Worker's escaped optional HTML body. The checked-in Apps Script maps that value to Gmail's `htmlBody` option after validation. The source change has not been deployed as part of the Pilot correction pass.

The Worker classifies a valid `{ "ok": true }` response as accepted. Definitive pre-send rejection uses an explicit allowlist matching Apps Script branches that return before `GmailApp.sendEmail`: `missing_auth`, `expired`, `invalid_nonce`, `bad_signature`, `malformed_json`, `invalid_message`, `invalid_recipient`, `invalid_from`, `invalid_reply_to`, `invalid_sender_name`, `invalid_subject`, `invalid_body`, `invalid_html_body`, and `alias_not_allowed`. Only an HTTP-success response carrying one of those codes is retryable. `replay`, `relay_busy`, `relay_unavailable`, unknown codes, HTTP errors, network errors, timeouts, aborts, malformed/incomplete responses, and invalid protocol responses are ambiguous because prior or current relay acceptance cannot be ruled out. Ambiguous attempts remain reserved and non-retryable to avoid duplicate email. This boundary cannot provide exactly-once delivery.

Explicit retry requires an existing logical notification in definitive `failed` state for the same organization, progress update, guardian, and event. The conditional `failed` to pending/submitting transition owns the retry; neither a missing failure, a submitted state, nor an ambiguous reservation can initiate a first-time retry send. Multi-recipient responses include reconciled counts and use a partial-result code whenever recipient outcomes differ, so a successful guardian submission is never hidden by another guardian's failure.

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
