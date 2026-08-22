# QuranTrack

QuranTrack — Quran Learning & Progress Platform

Kur'an Öğrenme ve Gelişim Platformu

## Current status — Phase 2.7 staff authentication verified in staging

QuranTrack is a full-stack Cloudflare Worker application. Phase 1 established its tenant-scoped D1 domain model, and Phase 2 completed secure staff magic-link authentication, Turnstile verification, server-controlled organization context, role authorization, session restoration, logout, and the Apps Script email relay.

Phase 3A added production-backed settings for the active organization. Phase 3B1 added production-backed staff memberships, invitations, roles, and organization switching. Phase 2.7 staff email/password authentication is complete: implementation is merged, migration `0005_cloudflare_password_work_factor.sql` was applied to the staging D1 database, the staging Worker was deployed with `PASSWORD_HASH_PEPPER`, and all Phase 2.7 staging acceptance tests passed. Production was not deployed or modified as part of the Phase 2.7 closeout.

Uploaded logos are resized/compressed in the browser and stored in D1 as validated PNG, JPEG, or WebP data URLs with a 200 KB encoded limit. HTTPS-hosted logos are also supported. SVG and signature/type mismatches are rejected.

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
| `npm run build`              | Type-check and create the local/preview-configured build.       |
| `npm run build:staging`      | Build staging with its Wrangler env and fictional UI preview.   |
| `npm run build:production`   | Build only with the explicit production Wrangler environment.   |
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
| `npm run deploy`             | Refuse unsafe, unqualified deployment.                          |
| `npm run deploy:staging`     | Build and deploy staging via Vite's redirected Wrangler config. |
| `npm run deploy:production`  | Build/deploy the explicit production config (operators only).   |

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
- `PASSWORD_HASH_PEPPER`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `APP_BASE_URL`
- `ENVIRONMENT`

### Cloudflare connected build — staging

Configure the connected staging build exactly as follows:

```text
Build command: npm run build:staging
Deploy command: npx wrangler deploy --config dist/qurantrack_preview/wrangler.json --keep-vars
Root directory: /
```

`build:staging` selects the staging Wrangler environment and produces a redirected configuration for Worker `qurantrack-staging`, D1 database `qurantrack-staging` (`bf824e5e-a67b-4592-950b-16d01cbd5689`), `ENVIRONMENT=staging`, and `APP_BASE_URL=https://qurantrack-staging.samet-2fb.workers.dev`. Do not substitute a plain `npm run build`: that command can emit the local `qurantrack-preview` binding with the placeholder `00000000-...` D1 ID.

The deploy command's `--keep-vars` preserves dashboard-managed non-secret mail variables. Configure only these required mail variable names through Cloudflare; never commit their real values:

- `MAIL_RELAY_URL`
- `MAIL_RELAY_SECRET`
- `MAIL_DEFAULT_FROM_ALIAS`
- `MAIL_APPROVED_FROM_ALIASES`

Pull requests must use the repository validation workflow, which runs `build:staging` without
Cloudflare credentials and performs no deployment. The unqualified Wrangler target is intentionally
named `qurantrack-preview`, and `npm run deploy` intentionally fails. A connected Cloudflare project
must target only `qurantrack-staging` with the commands above; it must not attach preview branches to
`qurantrack`. Production deployment is an operator-only, explicitly selected command and must never
be configured as a pull-request preview command.

Secrets remain managed through Cloudflare and must never be committed. An invitation with database delivery status `sent` was accepted by the configured relay for submission; it does **not** confirm inbox delivery.

## License

MIT

## Database documentation

See [`docs/DATABASE.md`](docs/DATABASE.md) for migration, seed, reset, inspect, and data-safety notes.

### Demo seed safety

Demo data is stored in `seeds/demo_seed.sql`, outside Wrangler’s migrations directory. Local and production migration commands apply schema only; production migrations do not seed fictional/demo records.

## Phase 2 authentication

Phase 2 adds staff magic-link authentication, Turnstile verification, the Google Apps Script mail relay, secure session cookies, organization switching, role checks, and one-time system-admin bootstrap. See `docs/AUTHENTICATION.md`, `docs/EMAIL_RELAY.md`, and `docs/BOOTSTRAP.md`.

Phase 2.6 separates verified From aliases from organization Reply-To configuration and hardens relay validation. Deployment operators must complete the placeholder-based post-merge staging steps in `docs/EMAIL_RELAY.md`; this repository does not contain deployment email addresses.

Phase 2.6 authentication, Turnstile, session, organization switching, and email relay behavior was manually verified end to end in staging. No real email address, alias allowlist, credential, or secret is recorded here.

## Phase 3B1 staff access

Phase 3B1 adds production-backed staff memberships, single-use organization invitations, per-organization roles, and authenticated organization switching. Invitation links expire after seven days and only purpose-separated, peppered hashes are stored. Staging verification covered administrator Staff-page access, invitation creation, email submission and receipt, invitation acceptance, membership creation, and Teacher / Mentor route restrictions; Phase 3B1 is complete.

### Pilot acceptance role

Run organization-owned Pilot acceptance with an active `organization_admin` membership. The
bootstrap `system_admin` account is limited to explicitly supported system-level capabilities and
must not receive a cross-tenant bypass to Classes, Students, Families, Program, or organization
progress data. Teachers see only assigned classes and their actively enrolled students.

Email/password is the primary staff authentication method and secure magic-link authentication remains an alternative. New users create a password during invitation acceptance, while existing passwordless users can create one after magic-link authentication. Students initially remain non-login records. Phase 2.7 is complete, and Phase 3B2—groups/classes, students, teacher assignments, enrollments/rosters, and server-enforced teacher visibility—is the next incomplete planned phase. Phase 3C will add approved default curriculum and program administration, and Phase 3D will add new-organization onboarding.

### Staff authentication

Staff use email/password by default and may alternatively request a secure magic link. Existing accounts can create their first password under **Account Security**. Passwords must be 8–128 Unicode code points and must not equal the account email address. Password hashing uses PBKDF2-HMAC-SHA-256 with 100,000 iterations for Cloudflare Workers compatibility and the independent `PASSWORD_HASH_PEPPER` Worker secret. Staging acceptance covered password creation, password login, password change, password reset, invitation acceptance, first-password creation, magic-link fallback, validation boundaries, and organization/role context. Production has not been deployed or modified for Phase 2.7.
