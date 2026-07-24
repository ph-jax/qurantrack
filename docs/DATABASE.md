# QuranTrack database

Phase 1 adds the core Cloudflare D1 schema in `migrations/0001_core_schema.sql`. Safe fictional demo data lives outside the migrations path in `seeds/demo_seed.sql` so `wrangler d1 migrations apply` never loads demo records.

## Local commands

- Apply local migrations: `npm run db:migrate:local`
- Apply remote production migrations: `npm run db:migrate:remote` (uses Wrangler `--env production --remote`)
- Seed local demo data intentionally: `npm run db:seed:local`
- Reset local development database: `npm run db:reset:local`
- Inspect local schema objects: `npm run db:inspect:local`

## Safety notes

- Demo seed data uses fictional display names and `example.com` addresses only.
- Tenant-owned tables include `organization_id` and repository methods require a trusted `organizationId` argument.
- Historically referenced rows are deactivated with `active = 0`; foreign keys use restrictive deletes to preserve history.
- Login, session, and guardian access token tables store token hashes only.

## Demo seed safety

`npm run db:migrate:local` applies schema migrations only and must leave tenant tables empty. Demo rows are added only when a developer explicitly runs `npm run db:seed:local`. Production and remote migration commands must not reference `seeds/demo_seed.sql`.
