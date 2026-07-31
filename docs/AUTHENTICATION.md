# Authentication and authorization

QuranTrack staff authentication uses email/password by default, with magic links as an alternative, Cloudflare Turnstile, opaque sessions, and server-resolved organization context.

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

## Organization invitations

Invitation tokens use a purpose domain separate from login tokens; only peppered hashes are persisted. Acceptance resolves the tenant and normalized identity from the trusted invitation record, consumes the invitation once, establishes the invited identity's session, and selects the inviting organization. A conflicting browser session is revoked rather than receiving the membership. Every protected request revalidates the active organization, membership state, organization state, and current role.

Phase 3B1 correction: every staff mutation carries the organization for which its page data was loaded. The server compares that value with the session tenant and returns `409 STALE_ORGANIZATION` before executing a write; it never uses the value to select a tenant. Invitation acceptance is one atomic D1 batch guarded by a unique acceptance claim and validation trigger, so any failed write rolls back the claim, user, membership, session, invitation timestamp, and audit event.

## Phase 2.7 password authentication (awaiting review/staging deployment)

Staff and administrators now use normalized email plus password as the primary sign-in method; the existing single-use magic-link flow remains an alternative and is the migration path for existing passwordless accounts. Passwords are PBKDF2-HMAC-SHA-256 derived with Web Crypto, 600,000 iterations, a random 16-byte salt, a 256-bit result, stored algorithm/work-factor metadata, and the independent `PASSWORD_HASH_PEPPER` Worker secret. Password policy is 15–128 Unicode characters, permits spaces, and rejects the normalized account email.

Public password, magic-link, and reset requests use purpose-separated hashed account/IP subjects in bounded 15-minute D1 counters. Password counters record failures only, so a successful login never consumes an account or shared-IP failure allowance. Reset tokens expire after 30 minutes, are stored only as purpose-separated hashes, are claimed once through a transaction-guarded consumption record, and invalidate older tokens. Creating/changing a password atomically replaces the credential, revokes every session, rotates the current browser session while retaining a valid active organization, and records an audit event. Reset revokes all sessions and requires a new sign-in.

A valid invitation reveals only the onboarding fields needed for that invited identity. A new user supplies a display name and password; an existing passwordless user supplies a password without replacing their display name; an existing credential is never requested or overwritten. User, credential when required, membership, one-time invitation claim, session, invitation timestamp, conflicting-session revocation, and audit writes share one D1 batch and roll back together. Parents may reuse this account foundation later; parent access is not implemented. Students remain non-login records.
