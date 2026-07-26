# Authentication and authorization

QuranTrack staff authentication uses magic links, Cloudflare Turnstile, opaque sessions, and server-resolved organization context.

- Login requests always return a generic response so unknown, inactive, or unauthorized emails are not disclosed.
- Mail sender resolution and delivery happen only after membership lookup. Missing sender configuration, relay rejection, and delivery failure are swallowed by the login endpoint so the same generic response is preserved.
- Tokens are generated with Web Crypto randomness. Only SHA-256 hashes with `TOKEN_HASH_PEPPER` are stored in D1.
- Login tokens expire after 15 minutes and are claimed with a conditional `used_at IS NULL AND expires_at > now` update before session creation, so repeated or racing consumption creates at most one session.
- Sessions use opaque random tokens stored in an `HttpOnly` cookie. D1 stores only token hashes, idle expiry, absolute expiry, and revocation state.
- Authenticated middleware reloads the active organization membership on every private request. Browser-provided organization IDs are never trusted as authority.
- Roles are `system_admin`, `organization_admin`, `teacher`, and `read_only`.
- The React login page renders Cloudflare Turnstile only when `VITE_TURNSTILE_SITE_KEY` is configured and never submits the documented local bypass token in production.

Required Worker variables/secrets are documented in `.dev.vars.example`.

Magic-link From addresses are resolved by the single server-side sender service. The verified deployment default is mandatory; a normalized organization override is accepted only from the deployment allowlist. Organization `email_sender_name` remains the display name, while `email_reply_to` is only Reply-To and is never a From alias. See `docs/EMAIL_RELAY.md` for relay security and staging steps.
