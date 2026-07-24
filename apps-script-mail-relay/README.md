# QuranTrack Apps Script mail relay

Deploy this Apps Script as a Web App owned by the Gmail or Google Workspace account that sends QuranTrack staff magic-link email.

1. Create a new Apps Script project and copy `Code.gs` and `appsscript.json`.
2. In **Project Settings → Script properties**, set `MAIL_RELAY_SECRET` to the same random secret configured in the Worker and `APPROVED_SENDER_ALIASES` to a comma-separated list of Gmail aliases allowed to send.
3. Deploy as **Web app**, execute as yourself, with access limited to the deployment option appropriate for your Google account.
4. Copy the Web App URL into the Worker secret/config `MAIL_RELAY_URL`.
5. Rotate `MAIL_RELAY_SECRET` by setting both Apps Script and Worker secrets before enabling production traffic.

The relay rejects stale timestamps, replayed nonces, invalid HMAC signatures, and unapproved sender aliases. Do not log request bodies because they include email addresses and sign-in links.
