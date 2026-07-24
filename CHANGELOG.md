# Changelog

All notable changes to QuranTrack will be documented in this file.

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
