# QuranTrack Implementation Plan

## Product scope

QuranTrack is a mobile-first Quran learning and progress platform for nonprofit organizations. The application will be implemented incrementally according to `docs/PRODUCT_SPEC.md`.

## Phase 0 — Repository inspection and scaffold

Status: Complete.

### Completed tasks

- Inspected the repository and confirmed it initially contained `README.md`, `docs/PRODUCT_SPEC.md`, and Git metadata.
- Read `docs/PRODUCT_SPEC.md` completely.
- Scaffolded a React, TypeScript, Vite, Tailwind CSS frontend.
- Added Cloudflare Workers Static Assets configuration with the Cloudflare Vite plugin.
- Added a Hono Worker API with `GET /api/v1/health`.
- Added Cloudflare D1 binding configuration in `wrangler.jsonc` without creating schema migrations.
- Configured ESLint, Prettier, Vitest, Playwright, and PWA metadata.
- Added a basic mobile-first frontend page.
- Added README, CHANGELOG, `.gitignore`, `.dev.vars.example`, and MIT LICENSE.
- Attempted `npm run test:e2e`; Playwright could not download browser binaries because the Codex environment returned HTTP 403 / Domain forbidden from the Playwright CDN.

### Playwright E2E limitation

- `npm run test:e2e` was attempted during Phase 0 validation.
- Playwright could not download browser binaries because the Codex environment returned HTTP 403 / Domain forbidden.
- E2E tests were not executed and must not be reported as passed.
- The Playwright configuration and E2E test files remain in the repository for execution in an environment where browser binaries are available.

### Intentional Phase 0 exclusions

The following items are explicitly deferred and must not be considered implemented:

- Authentication and authorization.
- Database tables and migrations.
- Email relay implementation.
- Students, teachers, guardians, classes, tracks, levels, lessons, or progress tracking.
- Parent portal.
- Imports, exports, reporting, and operational admin workflows.

## Major architecture decisions

1. **Single deployable Worker application**: QuranTrack will deploy as one Cloudflare Worker that serves static frontend assets and API routes.
2. **React SPA frontend**: The UI is a React single-page application built with Vite and styled with Tailwind CSS.
3. **Hono API router**: Worker API routing uses Hono and reserves `/api/v1/` for versioned JSON APIs.
4. **D1 as relational persistence**: D1 is configured now through the `DB` binding; versioned migrations begin in Phase 1.
5. **Strict TypeScript**: Separate TypeScript project references cover frontend, Worker, and Node tooling.
6. **No secrets in frontend variables**: `.dev.vars.example` documents secrets as Worker/local variables, not `VITE_*` variables.
7. **PWA from the start**: The app has installable manifest metadata and avoids caching private API data.
8. **Security baseline early**: The Worker adds request IDs and basic safe headers in Phase 0; stronger headers, auth, and cache policy are later phases.

## Next phases

### Phase 1 — Database and core domain

Status: Complete.

### Completed tasks

- Created the versioned Cloudflare D1 migration for the core QuranTrack schema.
- Added foreign keys, indexes, unique constraints, activation flags, organization ownership fields, UTC timestamp columns, and foreign-key enforcement in migrations.
- Added typed tenant-scoped repositories that require explicit trusted `organizationId` arguments for tenant-owned lookups.
- Added Zod schemas for IDs, emails, organizations, memberships, tracks, levels, lessons, classes, students, guardians, enrollments, progress update drafts, and progress update items.
- Added domain validation services for track/level/lesson relationships, class/teacher organization membership, student/class ownership, guardian/student ownership, student track-level assignment, and historical deactivation policy.
- Added safe fictional demo seed data outside the migrations path for one organization, two tracks, multiple levels and lessons, two teachers, two classes, students, guardians, enrollments, guardian links, and student track-level assignments.
- Added local D1 migrate, production-explicit remote D1 migrate, local-only seed, reset, and inspect commands.
- Added unit/integration tests for schema constraints, tenant scoping, cross-organization prevention, relationships, duplicate constraints, deactivation policy, and Zod validation.

### Intentional Phase 1 exclusions

- Authentication and authorization flows.
- Email delivery.
- Frontend administration screens.
- Teacher workflows.
- Parent portal.

### Phase 2 — Authentication and authorization

Status: Complete.

- Implemented magic-link request and consumption APIs with generic login responses, Turnstile validation, hashed single-use login tokens, secure session cookies, authenticated middleware, membership revalidation, roles, organization listing/switching, logout, one-time guarded system-admin bootstrap, and Google Apps Script email relay HMAC signing.
- Fixed the Phase 1 repository cleanup issue by separating active-entity repositories from link/current-state repositories that do not have an `active` column.
- Added focused tests for token hashing, relay signing, session cookies, role checks, and the active-column repository regression.
- Updated PR #3 fixes changed the Apps Script protocol to query-parameter authentication, added JSON response verification, rendered real Turnstile in the React login page, made magic-link consumption atomic, and strengthened focused auth tests.
- Live Apps Script deployment and browser E2E execution remain unverified in this environment.

### Phase 2.5 — UI/UX foundation and design system

Status: Approved and complete.

- Added project-owned light-theme design tokens, focused repository-owned shadcn-style components using Radix primitives, Lucide icons, and responsive QuranTrack layouts.
- Reorganized the frontend around React Router, protected routes, session state, role-aware navigation, page components, shared components, organization identity, and feature-separated fictional showcase data.
- Added polished login/session states while preserving Phase 2 Turnstile, generic response, cookie session, and server-authoritative organization security behavior.
- Added English and Turkish resources, persisted language selection, document language/direction updates, logical properties, Arabic content presentation, and RTL readiness.
- Added a fictional, non-mutating `/ui-preview` route enabled only in development or an explicit staging build with `VITE_ENABLE_UI_PREVIEW=true`; normal production builds exclude it.
- Product-owner staging review approved the Phase 2.5 visual direction and manually verified the corrected 320px/412px mobile containment and account-menu page stability.
- Playwright remains unexecuted in this environment because browser binaries are unavailable; no automated browser pass is claimed.
- Added focused behavior and accessibility tests and `docs/UI_DESIGN_SYSTEM.md`.
- No Phase 3 CRUD, database migration, upload flow, or production mutation API was added.

Further phases continue exactly as defined in `docs/PRODUCT_SPEC.md`.
