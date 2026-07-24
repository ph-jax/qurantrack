# Authentication and authorization

QuranTrack staff authentication uses magic links, Cloudflare Turnstile, opaque sessions, and server-resolved organization context.

- Login requests always return a generic response so unknown, inactive, or unauthorized emails are not disclosed.
- Tokens are generated with Web Crypto randomness. Only SHA-256 hashes with `TOKEN_HASH_PEPPER` are stored in D1.
- Login tokens expire after 15 minutes and are claimed with a conditional `used_at IS NULL AND expires_at > now` update before session creation, so repeated or racing consumption creates at most one session.
- Sessions use opaque random tokens stored in an `HttpOnly` cookie. D1 stores only token hashes, idle expiry, absolute expiry, and revocation state.
- Authenticated middleware reloads the active organization membership on every private request. Browser-provided organization IDs are never trusted as authority.
- Roles are `system_admin`, `organization_admin`, `teacher`, and `read_only`.
- The React login page renders Cloudflare Turnstile only when `VITE_TURNSTILE_SITE_KEY` is configured and never submits the documented local bypass token in production.

Required Worker variables/secrets are documented in `.dev.vars.example`.
