# QuranTrack database

Phase 1 adds the core Cloudflare D1 schema in `migrations/0001_core_schema.sql` and safe demo data in `migrations/0002_demo_seed.sql`.

## Local commands

- Apply local migrations: `npm run db:migrate:local`
- Apply remote migrations: `npm run db:migrate:remote`
- Seed local demo data: `npm run db:seed:local`
- Reset local development database: `npm run db:reset:local`
- Inspect local schema objects: `npm run db:inspect:local`

## Safety notes

- Demo seed data uses fictional display names and `example.com` addresses only.
- Tenant-owned tables include `organization_id` and repository methods require a trusted `organizationId` argument.
- Historically referenced rows are deactivated with `active = 0`; foreign keys use restrictive deletes to preserve history.
- Login, session, and guardian access token tables store token hashes only.
