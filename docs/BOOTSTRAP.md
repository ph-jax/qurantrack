# First system administrator bootstrap

The bootstrap endpoint is explicit and one-time guarded.

## Local steps

1. Create or migrate a local D1 database and create the first organization row.
2. Set `ENABLE_BOOTSTRAP_ADMIN=true` and a long random `BOOTSTRAP_SECRET` in `.dev.vars`.
3. POST to `/api/v1/auth/bootstrap/system-admin` with `email`, `displayName`, `organizationId`, and `secret`.
4. Set `ENABLE_BOOTSTRAP_ADMIN=false` and restart the Worker.

## Production steps

1. Ensure production migrations are applied and the initial organization exists.
2. Set `BOOTSTRAP_SECRET` with `wrangler secret put BOOTSTRAP_SECRET`.
3. Temporarily set `ENABLE_BOOTSTRAP_ADMIN=true` as a Worker variable.
4. Call the endpoint once from an operator-controlled machine.
5. Immediately set `ENABLE_BOOTSTRAP_ADMIN=false`, remove or rotate `BOOTSTRAP_SECRET`, and redeploy configuration.

The endpoint refuses to create another administrator once any `system_admin` membership exists. Never commit real administrator emails, tokens, or bootstrap secrets.
