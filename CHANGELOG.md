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
- Phase 2.5 proposed QuranTrack UI foundation with custom tokens, responsive application shell, accessible Radix interactions, shared components, English/Turkish internationalization, organization branding states, and a development-only fictional UI showcase.
- React Router route organization and explicit protected-route session states without protected-content flash.
- UI design-system documentation and behavior-focused UI tests.

### Security and compatibility fixes

- Corrected the Apps Script relay query-parameter protocol, verified relay JSON success responses, preserved real Turnstile integration, made magic-link consumption atomic, and added focused rejection/regression tests.

### Deferred

- Phase 3 production CRUD, organization branding upload/settings APIs, and data mutations remain intentionally unimplemented.

## Unreleased

- Configured account dropdowns as non-modal Radix menus to prevent mobile scroll-lock from shifting the preview page horizontally.
- Fixed intrinsic mobile sizing in the preview student, organization-branding, and loading cards at 320px and 412px without masking overflow globally.
- Added an isolated Cloudflare staging environment and explicit build-time UI-preview flag without exposing staging D1 configuration to production.
- Revalidated the unchanged Phase 2.5 implementation: lint, formatting, type checking, all 45 Vitest tests, and the production build pass; Playwright browser execution and screenshots remain unavailable in this environment.
- Corrected the Phase 2.5 frontend authentication contract to use the existing `/api/v1/me/organizations` routes, surface switch/logout failures, and expire stale sessions when organization loading is unauthorized.
- Prevented React StrictMode from consuming a single-use magic link more than once per token and added success, invalid, missing-token, and network regression coverage.
- Added unique development-preview destinations, completed Turkish interface translations, and prevented the login form from flashing during initial session validation.
- Fully isolated preview identity, organization switching, and account actions from authenticated session mutations, and completed StrictMode consume-flow coordination so refresh and navigation also execute once.
