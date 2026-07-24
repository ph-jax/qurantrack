# QuranTrack

QuranTrack — Quran Learning & Progress Platform

Kur'an Öğrenme ve Gelişim Platformu

## Phase 1 status

This repository is a Phase 1 full-stack Cloudflare Worker application with:

- React, TypeScript, Vite, and Tailwind CSS for the frontend.
- Cloudflare Workers Static Assets and the Cloudflare Vite plugin.
- Hono for JSON API routing under `/api/v1/`.
- Cloudflare D1 core schema migrations for organizations, users, program structure, classes, students, guardians, progress history, notifications, audit logs, and legacy imports.
- Typed tenant-scoped repositories, Zod validation schemas, and core domain validation services.
- ESLint, Prettier, Vitest, Playwright, and PWA manifest configuration.

Phase 1 intentionally does **not** implement authentication flows, email delivery, frontend administration screens, teacher workflows, or the parent portal.

## Requirements

- Node.js 22 or newer.
- npm.
- Wrangler CLI through the local `wrangler` dev dependency.

## NPM scripts

| Command                     | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `npm run dev`               | Start local Vite and Cloudflare Worker development.    |
| `npm run build`             | Type-check and create a production build.              |
| `npm run preview`           | Preview the production build locally.                  |
| `npm run lint`              | Run ESLint.                                            |
| `npm run format`            | Format all supported files with Prettier.              |
| `npm run format:check`      | Check formatting without changing files.               |
| `npm run typecheck`         | Run TypeScript type checking without emitting files.   |
| `npm run test`              | Run Vitest unit tests once.                            |
| `npm run test:watch`        | Run Vitest in watch mode.                              |
| `npm run test:e2e`          | Run Playwright browser tests.                          |
| `npm run db:migrate:local`  | Apply D1 migrations to the local preview database.     |
| `npm run db:migrate:remote` | Apply D1 migrations to the remote production database. |
| `npm run db:seed:local`     | Load safe fictional demo data into local D1.           |
| `npm run db:reset:local`    | Remove local D1 state and reapply migrations.          |
| `npm run db:inspect:local`  | List local D1 schema tables and indexes.               |
| `npm run deploy`            | Build and deploy with Wrangler.                        |

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Visit `/api/v1/health` to verify the Worker API. Apply the local database schema with `npm run db:migrate:local`; then optionally load fictional demo data with `npm run db:seed:local`.

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
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `APP_BASE_URL`
- `ENVIRONMENT`

## License

MIT

## Database documentation

See [`docs/DATABASE.md`](docs/DATABASE.md) for migration, seed, reset, inspect, and data-safety notes.
