# Runbook: Deployment

## Normal deploy

1. Confirm all 9 CI jobs are green on the commit to deploy
2. Follow `docs/DEPLOYMENT_CHECKLIST.md`
3. Deploy in order: **API → worker → web**
4. After each service: verify health endpoint returns 200

```sh
curl -sf https://<api-host>/api/v1/health/ready
curl -sf https://<worker-host>/health/ready
```

## Applying database migrations

Run migrations **before** deploying new application code that depends on them.

```sh
# Against production DATABASE_URL
DATABASE_URL=<production-url> pnpm --filter @verifit/database exec prisma migrate deploy
```

`migrate deploy` applies pending migrations only — it never resets or recreates the schema.

## Rollback

### Application rollback (no schema changes)

Redeploy the previous image tag / commit. No database action needed.

### Application rollback (with schema changes)

Prisma does not auto-generate down migrations. Steps:

1. Redeploy the previous application version
2. If the new migration added columns/tables with no data yet, manually drop them:
   ```sql
   -- Example: DROP TABLE IF EXISTS new_table;
   -- Example: ALTER TABLE users DROP COLUMN IF EXISTS new_column;
   ```
3. Remove the migration record from `_prisma_migrations`:
   ```sql
   DELETE FROM _prisma_migrations WHERE migration_name = '<migration_name>';
   ```
4. Verify: `prisma migrate status` shows the migration as not applied

**Always test rollback steps in a staging environment first.**

## Rollback triggers

Initiate rollback immediately if within 15 minutes of deploy:

- API error rate > 5 %
- Health endpoint non-200 for > 2 minutes
- Redis disconnected (see `docs/runbooks/REDIS_FAILURES.md`)
- Database connection failures (see `docs/runbooks/DATABASE_FAILURES.md`)

## Post-rollback

- Document the incident: what failed, what was rolled back, timeline
- Do not re-deploy the same commit without fixing the root cause and re-running CI
