# QuranTrack database

Phase 1 adds the core Cloudflare D1 schema in `migrations/0001_core_schema.sql`. Safe fictional demo data lives outside the migrations path in `seeds/demo_seed.sql` so `wrangler d1 migrations apply` never loads demo records.

Phase 2.6 adds nullable `organizations.email_sender_alias` in `0002_organization_email_sender_alias.sql`; the original core migration remains immutable. `NULL` selects the deployment-default sender.

## Local commands

- Apply local migrations: `npm run db:migrate:local`
- Apply remote production migrations: `npm run db:migrate:remote` (uses Wrangler `--env production --remote`)
- Seed local demo data intentionally: `npm run db:seed:local`
- Reset local development database: `npm run db:reset:local`
- Inspect local schema objects: `npm run db:inspect:local`

## Safety notes

- Demo seed data uses fictional display names and `example.com` addresses only.
- Tenant-owned tables include `organization_id` and repository methods require a trusted `organizationId` argument.
- Historically referenced rows are deactivated with `active = 0`; foreign keys use restrictive deletes to preserve history.
- Login, session, and guardian access token tables store token hashes only.

## Demo seed safety

`npm run db:migrate:local` applies schema migrations only and must leave tenant tables empty. Demo rows are added only when a developer explicitly runs `npm run db:seed:local`. Production and remote migration commands must not reference `seeds/demo_seed.sql`.

## Phase 3B1 invitation migration

`0003_organization_invitations.sql` adds tenant-scoped invitations with a unique token hash, normalized email, permitted role, inviter, seven-day expiry, acceptance/revocation timestamps, and delivery retry status. A partial unique index permits only one usable invitation for an organization/email pair. Memberships remain soft-deactivated.

Migration 0003 also creates `organization_invitation_acceptances` and a validation trigger. A unique claim serializes concurrent acceptance and all acceptance writes execute in one atomic D1 batch. Final-administrator changes use one conditional update whose `EXISTS` guard is evaluated with the write, avoiding a count/update race.

Phase 3B1 review corrections are verified with a real in-memory SQLite database (`node:sqlite`) that executes migrations 0001, 0002, and 0003 unchanged. The D1-compatible adapter executes `batch()` inside `BEGIN IMMEDIATE`/`COMMIT` and uses actual SQLite rollback, triggers, foreign keys, partial indexes, and unique constraints; failure injection throws between real SQL statements and verifies the transaction returns to its pre-acceptance state.

## Migration 0004 — password authentication

`user_password_credentials` stores one global credential per user with algorithm and work-factor upgrade metadata. `password_reset_tokens` stores unique hashes and lifecycle timestamps. `authentication_rate_limits` atomically upserts purpose-separated hashed subjects; requests opportunistically delete up to 100 expired rows. Migration 0004 is additive and applies after 0001–0003.
