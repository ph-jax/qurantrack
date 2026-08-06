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

## Password authentication migrations

`0004_password_authentication.sql` adds password authentication storage. `user_password_credentials` stores one global credential per user with algorithm and work-factor upgrade metadata. `password_reset_tokens` stores unique hashes and lifecycle timestamps. `password_reset_consumptions` plus its validation trigger provides a unique transactional claim so racing reset requests cannot both change a password. `authentication_rate_limits` atomically upserts purpose-separated hashed subjects; requests opportunistically delete up to 100 expired rows. Migration 0004 is additive and applies after 0001–0003.

`0005_cloudflare_password_work_factor.sql` rebuilds the credential table with the Cloudflare-compatible PBKDF2 work-factor constraint so new 100,000-iteration credentials can be stored. It has been applied to the remote staging D1 database `qurantrack-staging` (`bf824e5e-a67b-4592-950b-16d01cbd5689`) as part of Phase 2.7 staging verification. Production was not migrated as part of the Phase 2.7 closeout.

## Pilot MVP migration 0006

Migration `0006_guardian_preferred_locale.sql` adds `guardians.preferred_locale`, an optional locale constrained to `en` or `tr`. The field is intentionally limited to the guardian progress-email MVP: templates use the guardian preference when present and fall back to the organization's default locale otherwise.

The Pilot MVP continues to use the existing roster and progress tables. Current teacher assignment is represented by row presence in `class_teachers`; withdrawal history is preserved with `class_enrollments.active`, `enrolled_at`, and `withdrawn_at`; published progress updates write history to `progress_updates`/`progress_update_items` and maintain compact lesson state in `student_lesson_status`.

## Pilot notification reservation migration 0007

Migration `0007_notification_attempts.sql` adds append-only submission attempts. The existing unique `(organization_id, deduplication_key)` constraint reserves one logical progress-update/guardian notification, while attempt rows retain pending, relay-accepted, and failed explicit attempts. Failed submissions can move back to pending only through explicit retry; pending and relay-accepted submissions are not automatically resent. Relay acceptance is not confirmed inbox delivery.

## Pilot correctness migration 0008

Migration `0008_progress_idempotency.sql` adds a tenant-scoped unique progress-operation key so repeated draft/create requests resolve to one progress update. Draft publication conditionally transitions that same row, and an already-published request returns the existing result without replacing historical items. The migration also adds `student_lesson_status.latest_published_at`, which provides a stable equal-activity-date tie-breaker. Backdated history can establish an earlier `first_passed_at`, but current lesson state changes only for a chronologically newer activity date, then newer publication timestamp, then stable update ID. Migration `0009_progress_publication_claim.sql` adds one unique publication claim per update so concurrent draft-to-publication batches cannot delete or replace the winning publication’s items.

Notification `pending` represents a committed submission reservation at the external-relay boundary. It is non-retryable because the relay may have accepted the message even if D1 could not persist final acceptance; only a definitively recorded `failed` attempt permits explicit retry. `sent` continues to mean relay-accepted/submitted, never confirmed inbox delivery.

Publication collision recovery verifies the stored row reached the caller's requested state and identity. A rolled-back draft-to-publication batch that leaves a draft returns a safe error; only a concurrent request that actually published the same operation can satisfy the retry. Progress activity dates are authoritatively validated as real, exact `YYYY-MM-DD` calendar dates before any write.
