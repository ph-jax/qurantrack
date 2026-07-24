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

## Unreleased

- Implemented Phase 2 authentication and authorization: magic links, Turnstile validation, Apps Script mail relay, hashed opaque sessions, role helpers, organization switching, logout, bootstrap documentation, and repository active-column regression coverage.

- Fixed merge-blocking Phase 2 auth defects: Apps Script relay query-parameter protocol, relay JSON success checks, real Turnstile frontend integration, atomic magic-link consumption, and added focused rejection/regression tests.
