# Deployment Checklist

Run through this list for every production deployment.

## Pre-deploy

- [ ] All 9 CI jobs passing on the commit being deployed
- [ ] `pnpm audit --audit-level=high` clean
- [ ] Migration diff reviewed — no destructive changes without a backup
- [ ] `PRODUCTION_READINESS.md` checklist met for any new items introduced in this release
- [ ] Rollback plan identified (previous image tag / commit SHA noted)

## Database

- [ ] `prisma migrate status` shows no pending migrations on production DB, or pending migrations have been reviewed
- [ ] If new migrations exist: tested against a production-schema clone first
- [ ] Backup taken immediately before applying migrations

## Deploy

- [ ] Deploy API first, then worker, then web (dependency order)
- [ ] Health endpoints return `200` after each service restarts:
  - `GET /api/v1/health/ready`
  - `GET /health/ready`
- [ ] No spike in error rate in the 5 minutes following deploy

## Post-deploy

- [ ] Smoke test: `GET /api/v1/health/ready` → `{"status":"ok"}`
- [ ] Smoke test: `GET /health/ready` → `{"status":"healthy"}`
- [ ] Log aggregation showing clean startup (no `ERROR` lines at boot)
- [ ] Deployment entry added to the team changelog

## Rollback trigger

Roll back immediately if any of the following occur within 15 minutes of deploy:

- API error rate > 5 %
- Health endpoint returning non-200
- Redis disconnected
- Database connection failures

See `docs/runbooks/DEPLOYMENT.md` for rollback steps.
