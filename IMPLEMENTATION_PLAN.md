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

### Phase 2.6 — Configurable email sender and relay hardening

- Added an optional organization From override in a new migration while keeping display name and Reply-To distinct.
- Added a deployment-default sender and verified allowlist, with normalized approved overrides and safe fallback/failure behavior.
- Hardened Apps Script parsing, field/length validation, primary-account and additional-alias authorization, structured responses, and safe deploying-account-only testing while preserving HMAC, timestamp, nonce, and replay controls.
- Preserved generic login responses and single-use token behavior. Phase 3 CRUD, onboarding, and program administration remain out of scope.

Further phases continue exactly as defined in `docs/PRODUCT_SPEC.md`.

### Phase 3A — Organization settings and branding

Status: Complete in code; awaiting review.

- Added authenticated GET and administrator-only PATCH APIs using the active organization from the validated server session.
- Added prepared-statement persistence for all existing organization settings fields; no migration was required.
- Added strict locale, IANA time-zone, hex color, HTTPS URL, email, numeric-limit, approved-alias, encoded-size, MIME, and image-signature validation.
- Replaced the settings placeholder with a responsive English/Turkish form, live preview, upload compression, stored-logo removal, and explicit loading/success/error/read-only states.
- Preserved the completed Phase 2.6 authentication and tenant-isolation behavior. Organization creation, memberships, program content, and onboarding remain deferred.

### Multi-organization access requirements for later Phase 3 work

- One QuranTrack installation may host multiple strictly isolated organizations, such as a Weekend School and Youth Groups. Each organization owns its administrators, teachers or mentors, students, groups or classes, curriculum, settings, and progress records.
- A user may hold memberships in multiple organizations and may have a different role in each. Multi-organization users must be able to switch their active organization, and every request must be authorized against that active organization's membership and role.
- Organization administrators may see all students in their active organization. Teachers and mentors may see only students assigned to their groups or classes in that organization; organization membership by itself must never grant a teacher access to every student.
- Teacher and mentor visibility must be enforced server-side through group or class assignments and active enrollments. Browser filtering is presentation only and must never be treated as an authorization boundary.
- The same student may participate in multiple organizations, but each organization's enrollment, lesson progress, comments, homework, and reports remain separate organization-owned records.
- Cross-organization access is prohibited. Only an authorized platform-level `system_admin` may perform an explicitly defined cross-organization platform operation; ordinary organization and teacher workflows remain scoped to the active organization.

### Phase 3B — Memberships, rosters, and group assignments

- Implement organization-scoped administrator, teacher or mentor, and read-only memberships, including different roles for the same user across organizations and active-organization switching.
- Implement organization-owned student rosters, groups or classes, teacher assignments, and enrollments without merging records or progress across organizations.
- Apply server-side student-visibility authorization to every roster, enrollment, search, detail, progress, comment, homework, and report endpoint: organization administrators receive organization-wide access, while teachers and mentors require a matching group or class assignment and enrollment.
- Add tenant-isolation and authorization tests covering multi-membership role differences, active-organization switching, teacher assignment boundaries, students participating in multiple organizations, and prohibited cross-organization access.

### Phase 3C — Program administration and default curriculum installation

- Define versioned QuranTrack default curriculum templates containing the approved starter tracks and levels, with English and Turkish labels where applicable.
- Obtain or confirm product-owner approval of the final starter curriculum before Phase 3C implementation; this plan intentionally does not invent track or level names.
- Add a safe, idempotent installation process that copies template content into organization-owned records without retaining shared mutable curriculum records.
- Allow administrators to edit, order, activate, deactivate, and delete installed tracks, levels, and lessons using the same tenant-isolation and authorization guarantees as other organization-owned content.
- Provide an **Install Default Curriculum** action for existing organizations.
- Detect prior installation and existing organization content so rerunning installation never duplicates records or overwrites previously customized content.

### Phase 3D — New-organization onboarding

- Add new-organization onboarding that installs the approved default curriculum or explicitly offers it during setup, so administrators are not required to create every track and level manually.
- Reuse the Phase 3C versioned, idempotent installation process so onboarding cannot duplicate or overwrite organization-owned curriculum content.
- Create or invite only organization-scoped memberships and establish the new organization as the active organization without changing the user's roles or access in any other organization.
- Keep onboarding-created administrators, teachers or mentors, students, groups or classes, curriculum, settings, enrollments, and progress records isolated within the new organization.

## Phase 3B1 — staff access

Status: Complete following staging acceptance.

Staging verification covered administrator Staff-page access, invitation creation, email submission and receipt, invitation acceptance, membership creation, and Teacher / Mentor route restrictions. Staff authentication is now email/password by default with secure magic links retained as an alternative. Students initially remain non-login records. Groups/classes, teacher assignments, rosters, enrollments, and server-enforced teacher visibility remain Phase 3B2 after the authentication-enhancement decision is implemented; approved curriculum is Phase 3C; new-organization onboarding is Phase 3D.

### Phase 2.7 — Password authentication

Implemented in code; awaiting review and an explicitly approved staging migration/deployment. Phase 3B1 is complete based on staging acceptance. Phase 3B2 remains out of scope.
