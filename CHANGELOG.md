# Changelog

All notable changes to QuranTrack will be documented in this file.

## [0.2.0] - 2026-07-24

### Added

- Phase 1 Cloudflare D1 core schema migration and fictional local demo seed data kept outside the migrations path.
- Typed tenant-scoped repository layer for core domain records.
- Zod validation schemas for core identifiers and entity payloads.
- Domain validation services for tenant ownership and program relationship invariants.
- Local database commands for migrating, intentionally seeding local demo data, resetting, and inspecting D1, plus a production-explicit remote migration command.
- Unit and integration tests for schema constraints, tenant scoping, relationship validation, deactivation policy, duplicate constraints, and Zod validation.

### Not implemented yet

- Authentication, email delivery, frontend administration screens, teacher workflows, and the parent portal remain deferred to later phases.

## [0.1.0] - 2026-07-23

### Added

- Phase 0 project scaffold for QuranTrack.
- React, TypeScript, Vite, Tailwind CSS, Cloudflare Workers Static Assets, Cloudflare Vite plugin, Hono, and D1 binding configuration.
- ESLint, Prettier, Vitest, Playwright, and PWA manifest setup.
- Basic QuranTrack frontend landing page.
- `GET /api/v1/health` endpoint with a safe JSON response envelope.
- README, implementation plan, environment example, `.gitignore`, and MIT license.

### Testing notes

- `npm run test:e2e` was attempted during Phase 0 validation.
- Playwright could not download browser binaries because the Codex environment returned HTTP 403 / Domain forbidden.
- E2E tests were not executed and must not be reported as passed.
- The Playwright configuration and E2E test files remain in the repository for execution in an environment where browser binaries are available.

### Not implemented yet

- Authentication, database schema, email relay, students, teachers, guardians, and progress tracking are deferred until later phases.

## [0.3.0] - 2026-07-24

### Added

- Phase 2 authentication and authorization: magic links, Turnstile validation, Apps Script mail relay, hashed opaque sessions, role helpers, organization switching, logout, bootstrap documentation, and focused security coverage.
- Phase 2.5 product-owner-approved QuranTrack UI foundation with custom tokens, responsive application shell, accessible Radix interactions, shared components, English/Turkish internationalization, organization branding states, and a gated fictional UI showcase.
- React Router route organization and explicit protected-route session states without protected-content flash.
- UI design-system documentation and behavior-focused UI tests.

### Security and compatibility fixes

- Corrected the Apps Script relay query-parameter protocol, verified relay JSON success responses, preserved real Turnstile integration, made magic-link consumption atomic, and added focused rejection/regression tests.

### Deferred

- Phase 3 production CRUD, organization branding upload/settings APIs, and data mutations remain intentionally unimplemented.

## Unreleased

- Disabled all settings controls while a save is in flight so edits cannot be silently overwritten by the response, and added localized stale-organization conflict feedback.
- Added a final Phase 3A stale-organization guard: PATCH compares the loaded settings organization ID with the authenticated active organization, returns `409` without an update on mismatch, and disables saving while organization switching is pending without trusting the browser ID as a tenant selector.
- Corrected the Phase 3A settings review findings: nullable optional email/logo fields now round-trip through PATCH, upload failures are visible, edits clear stale success feedback, duplicate saves are guarded, logo previews recover when their source changes, and organization switches reload settings without rendering stale responses.
- Expanded Phase 3A security and behavior coverage for route authorization, trusted tenant binding, cross-tenant isolation, validation atomicity, supported and rejected image formats, read-only controls, upload errors, save feedback, and active-organization changes.
- Added Phase 3A production organization settings APIs and responsive English/Turkish administration UI with live branding preview.
- Added administrator authorization, session-derived tenant scoping, approved sender-alias enforcement, strict settings validation, and safe PNG/JPEG/WebP data-URL uploads capped at 200 KB encoded.
- Reused the existing organization schema, so Phase 3A requires no database migration.
- Recorded successful manual end-to-end staging verification of Phase 2.6 authentication without recording real addresses, approved-alias configuration, or secrets.

- Added Phase 2.6 configurable mail sender resolution: a required allowlisted deployment default, optional allowlisted organization override, and strict separation of From, display name, and Reply-To.
- Added the additive `0002_organization_email_sender_alias.sql` migration and hardened the Apps Script relay's sender authorization, input handling, structured errors, and deploying-account-only test function without committing deployment addresses.

- Marked the Phase 2.5 visual foundation approved and complete after product-owner staging review; the mobile containment and account-menu stability repairs were manually verified in the deployed staging preview, while Playwright remains unexecuted because browser binaries are unavailable.
- Confirmed Phase 3 has not started and synchronized base, staging, and production Worker `APP_VERSION` values to `0.3.0` without changing D1 bindings or IDs.
- Configured account dropdowns as non-modal Radix menus to prevent mobile scroll-lock from shifting the preview page horizontally.
- Fixed intrinsic mobile sizing in the preview student, organization-branding, and loading cards at 320px and 412px without masking overflow globally.
- Added an isolated Cloudflare staging environment and explicit build-time UI-preview flag without exposing staging D1 configuration to production.
- Revalidated the unchanged Phase 2.5 implementation: lint, formatting, type checking, the complete Vitest suite, and the production build pass; Playwright browser execution and screenshots remain unavailable in this environment.
- Corrected the Phase 2.5 frontend authentication contract to use the existing `/api/v1/me/organizations` routes, surface switch/logout failures, and expire stale sessions when organization loading is unauthorized.
- Prevented React StrictMode from consuming a single-use magic link more than once per token and added success, invalid, missing-token, and network regression coverage.
- Added unique development-preview destinations, completed Turkish interface translations, and prevented the login form from flashing during initial session validation.
- Fully isolated preview identity, organization switching, and account actions from authenticated session mutations, and completed StrictMode consume-flow coordination so refresh and navigation also execute once.

## Phase 3B1

- Completed Phase 3B1 following staging acceptance.
- Clarified invitation lifecycle versus relay-submission status, removed the obsolete live-layout preview notice, and corrected Staff-page secondary-text contrast.
- Made staging deployment preserve dashboard variables and documented the exact connected-build configuration.
- Added tenant-scoped staff membership administration and organization-aware invitations.
- Added secure seven-day, single-use invitation acceptance and session establishment.
- Enhanced organization switching to show each membership role and discard prior tenant UI state.
- Marked Phase 3A complete and manually accepted in staging.

## Unreleased — Phase 2.7

- Added PBKDF2 staff password credentials, password login/management/reset APIs, D1 authentication throttling, and English/Turkish account-security UI.
- Integrated display-name/password onboarding into atomic invitation acceptance, made password rotation and reset race claims transactional, counted password-login failures only, and added safe successful-login auditing.
- Preserved secure magic-link login as an alternative. Phase 2.7 is implemented in code and awaiting review and an explicitly approved staging deployment.
- Marked Phase 3B1 complete following staging acceptance.

## Unreleased

- Added the QuranTrack Pilot MVP vertical slice for local organizational use: admin roster setup, manual curriculum administration, student track-level assignment, teacher-visible rosters, progress drafting/publishing, homework summaries, and guardian notification submission through the existing mail relay.
- Added `0006_guardian_preferred_locale.sql` to store an optional validated `guardians.preferred_locale` (`en` or `tr`) for progress email template selection.
- Documented that progress notification `sent` status means the mail relay accepted/submitted the message, not confirmed inbox delivery.
- Completed production-backed administrator setup controls, editable teacher drafts, and English/Turkish localization for pilot screens and guardian-email outcome labels.
- Tightened tenant relationship validation, made progress publication atomic, and added `0007_notification_attempts.sql` for concurrency-safe notification reservation with retained retry history.
- Fixed shared administrator editor remounting and update SQL so selecting a different class, student, guardian, track, level, or lesson cannot retain stale form values or create an unintended duplicate.
- Added `0008_progress_idempotency.sql` and `0009_progress_publication_claim.sql`, stable draft-to-publication idempotency, backdated lesson-state ordering, immutable level/lesson parents, honest ambiguous notification handling, accurate Publish & Notify results, and Apps Script `htmlBody` support. The Apps Script source was not deployed.
- Corrected publication collision recovery to reject rolled-back drafts, classified explicit relay rejection separately from transport/protocol uncertainty, preserved notification results across form resets with accurate tones, and enforced strict real-calendar `YYYY-MM-DD` activity dates.
- Restricted retryable relay rejection to a documented pre-send code allowlist, blocked first-time and ambiguous retry requests, added truthful mixed-recipient counts/partial results, and surfaced safe standalone Send/Retry request failures.
- Preserved stored recipient states in explicit-retry results, so submitted guardians remain counted as already submitted and uncertain reservations remain ambiguous while only definitive failures are retried.

## Guardian notification center and homework revisions

- Progress publication now uses one combined, localized progress/comment/homework email per eligible guardian and reports authoritative relay-submission results.
- Added explicit, immutable published-homework revisions with optional guardian notification and organization notification history/retry controls.
- Added migration `0010_homework_revisions.sql`; cancellation notifications, reminders, and parent access remain excluded.
