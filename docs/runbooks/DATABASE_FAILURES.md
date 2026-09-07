# Runbook: Database Failures

## Symptoms

- API `/api/v1/health/ready` returns non-200 or `{"status":"error"}`
- Application logs contain `PrismaClientKnownRequestError`, `Can't reach database server`, or `Connection pool timeout`
- CI `db-migrations` job fails

## Diagnosis

```sh
# 1. Check container / service status
docker compose ps

# 2. Check PostgreSQL logs
docker compose logs postgres --tail=50

# 3. Verify connectivity
docker compose exec postgres pg_isready -U verifit -d verifit

# 4. Check migration state
pnpm --filter @verifit/database exec prisma migrate status
```

## Remediation

### Container not running

```sh
docker compose up -d postgres
# Wait for healthy status
docker compose ps
```

### Migration drift (pending migrations)

```sh
# Development only — never reset production
pnpm db:migrate
```

### Connection pool exhausted

- Restart the API process to release connections
- Check for long-running queries: `SELECT pid, query, state, query_start FROM pg_stat_activity WHERE state != 'idle';`
- Kill blocking queries if necessary: `SELECT pg_terminate_backend(<pid>);`

### Corrupt data volume (development only)

```sh
# Destroys all data — development only
docker compose down -v
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
```

## Escalation

If the managed production database is unreachable and the above steps do not resolve it within 15 minutes, escalate to the infrastructure owner and initiate the rollback procedure in `docs/runbooks/DEPLOYMENT.md`.

## Prevention

- Never run `prisma migrate reset` against production
- Always take a backup before applying migrations (see `docs/DEPLOYMENT_CHECKLIST.md`)
- Monitor connection pool utilisation; alert at 80 % capacity
