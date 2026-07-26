# QuranTrack

QuranTrack — Quran Learning & Progress Platform

Kur'an Öğrenme ve Gelişim Platformu

## Current status — Phase 2.5 UI foundation

QuranTrack is a full-stack Cloudflare Worker application. Phase 1 established its tenant-scoped D1 domain model, and Phase 2 completed secure staff magic-link authentication, Turnstile verification, server-controlled organization context, role authorization, session restoration, logout, and the Apps Script email relay.

Phase 2.5 completes the product-owner-approved, light-theme QuranTrack design system: Tailwind design tokens, repository-owned shadcn-style components backed by Radix primitives, Lucide icons, React Router, English/Turkish internationalization, a responsive authenticated shell, and polished authentication states. The production routes for students, teachers, classes, program, reports, families, notifications, and settings remain honest placeholders; Phase 3 CRUD has not begun.

### Development UI showcase

Run `npm run dev`, then open `http://localhost:5173/ui-preview`. The showcase uses only fictional in-memory data and calls no mutation APIs. It is enabled only in Vite development mode or in an explicit staging build where `VITE_ENABLE_UI_PREVIEW=true`. A normal production build omits the preview route configuration and safely resolves `/ui-preview` to the not-found page. A query parameter cannot enable it.

The Phase 2.5 visual direction is approved. The code-native QT monogram remains a temporary placeholder and is not an approved final logo. See [`docs/UI_DESIGN_SYSTEM.md`](docs/UI_DESIGN_SYSTEM.md).

## Requirements

- Node.js 22 or newer.
- npm.
- Wrangler CLI through the local `wrangler` dev dependency.

## NPM scripts

| Command                      | Purpose                                                         |
| ---------------------------- | --------------------------------------------------------------- |
| `npm run dev`                | Start local Vite and Cloudflare Worker development.             |
| `npm run build`              | Type-check and create a production build.                       |
| `npm run build:staging`      | Build staging with its Wrangler env and fictional UI preview.   |
| `npm run preview`            | Preview the production build locally.                           |
| `npm run lint`               | Run ESLint.                                                     |
| `npm run format`             | Format all supported files with Prettier.                       |
| `npm run format:check`       | Check formatting without changing files.                        |
| `npm run typecheck`          | Run TypeScript type checking without emitting files.            |
| `npm run test`               | Run Vitest unit tests once.                                     |
| `npm run test:watch`         | Run Vitest in watch mode.                                       |
| `npm run test:e2e`           | Run Playwright browser tests.                                   |
| `npm run db:migrate:local`   | Apply D1 migrations to the local preview database.              |
| `npm run db:migrate:remote`  | Apply D1 migrations with Wrangler `--env production --remote`.  |
| `npm run db:migrate:staging` | Apply migrations to the remote staging D1 database explicitly.  |
| `npm run db:seed:local`      | Intentionally load safe fictional demo data into local D1 only. |
| `npm run db:reset:local`     | Remove local D1 state and reapply migrations.                   |
| `npm run db:inspect:local`   | List local D1 schema tables and indexes.                        |
| `npm run deploy`             | Build and deploy with Wrangler.                                 |
| `npm run deploy:staging`     | Build and deploy staging via Vite's redirected Wrangler config. |

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Visit `/api/v1/health` to verify the Worker API. Apply the local database schema with `npm run db:migrate:local`; this applies schema only and does not insert demo rows. Optionally load fictional local-only demo data with `npm run db:seed:local`.

## Cloudflare configuration

The committed `wrangler.jsonc` uses placeholder D1 database IDs. Replace them with real IDs after creating Cloudflare D1 databases.

Required D1 binding:

- `DB`

Worker variables configured in `wrangler.jsonc`:

- `APP_VERSION`
- `ENVIRONMENT`

Secrets or local-only variables documented in `.dev.vars.example`:

- `SESSION_SIGNING_SECRET`
- `TOKEN_HASH_PEPPER`
- `MAIL_RELAY_URL`
- `MAIL_RELAY_SECRET`
- `MAIL_DEFAULT_FROM_ALIAS` (verified deployment default; do not commit a real address)
- `MAIL_APPROVED_FROM_ALIASES` (comma-separated verified allowlist including the default)
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `APP_BASE_URL`
- `ENVIRONMENT`

## License

MIT

## Database documentation

See [`docs/DATABASE.md`](docs/DATABASE.md) for migration, seed, reset, inspect, and data-safety notes.

### Demo seed safety

Demo data is stored in `seeds/demo_seed.sql`, outside Wrangler’s migrations directory. Local and production migration commands apply schema only; production migrations do not seed fictional/demo records.

## Phase 2 authentication

Phase 2 adds staff magic-link authentication, Turnstile verification, the Google Apps Script mail relay, secure session cookies, organization switching, role checks, and one-time system-admin bootstrap. See `docs/AUTHENTICATION.md`, `docs/EMAIL_RELAY.md`, and `docs/BOOTSTRAP.md`.

Phase 2.6 separates verified From aliases from organization Reply-To configuration and hardens relay validation. Deployment operators must complete the placeholder-based post-merge staging steps in `docs/EMAIL_RELAY.md`; this repository does not contain deployment email addresses.
