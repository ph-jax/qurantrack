# QuranTrack

QuranTrack — Quran Learning & Progress Platform

Kur'an Öğrenme ve Gelişim Platformu

## Phase 0 status

This repository is scaffolded as one full-stack Cloudflare Worker application with:

- React, TypeScript, Vite, and Tailwind CSS for the frontend.
- Cloudflare Workers Static Assets and the Cloudflare Vite plugin.
- Hono for JSON API routing under `/api/v1/`.
- Cloudflare D1 binding configuration for future migrations.
- ESLint, Prettier, Vitest, Playwright, and PWA manifest configuration.

Phase 0 intentionally does **not** implement authentication, database tables, email, students, teachers, or progress tracking.

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
| `npm run db:seed:local`     | Placeholder seed command; seeds begin in Phase 1.      |
| `npm run deploy`            | Build and deploy with Wrangler.                        |

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Visit `/api/v1/health` to verify the Worker API.

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
