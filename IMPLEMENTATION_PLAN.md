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

- Create D1 migrations.
- Add foreign keys and indexes.
- Create repositories, domain services, validation schemas, seed data, and tenant-scoping tests.

### Phase 2 — Authentication and authorization

- Implement magic-link auth, Turnstile verification, session cookies, memberships, roles, tenant middleware, logout, bootstrap admin, and Apps Script email relay.

Further phases continue exactly as defined in `docs/PRODUCT_SPEC.md`.
