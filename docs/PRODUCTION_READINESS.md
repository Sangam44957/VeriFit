# Production Readiness

Checklist of what must be true before VeriFit is deployed to a production environment.

## Phase 0 status

Phase 0 establishes the foundation only. The items below are **not yet met** — they are targets for subsequent phases.

## Infrastructure

- [ ] PostgreSQL running on managed service (RDS, Cloud SQL, etc.) with automated backups enabled
- [ ] Redis running on managed service (ElastiCache, Upstash, etc.) with persistence enabled
- [ ] All secrets stored in a secrets manager (AWS Secrets Manager, Vault) — not in environment files
- [ ] TLS termination in front of API and web app
- [ ] Database connection pooling (PgBouncer or equivalent)

## Application

- [ ] `NODE_ENV=production` set in all app processes
- [ ] `API_DOCS_ENABLED=false` (Swagger UI disabled in production)
- [ ] Structured JSON logging with a log aggregation pipeline
- [ ] Error tracking (Sentry or equivalent) integrated
- [ ] Health endpoints (`/api/v1/health/ready`, `/health/ready`) wired to load-balancer health checks

## Security

- [ ] All items in `SECURITY.md` controls verified
- [ ] `CORS_ORIGINS` restricted to production domain only
- [ ] Rate limiting enabled on the API
- [ ] Dependency audit clean at `--audit-level=high`

## Observability

- [ ] Metrics exported (Prometheus or CloudWatch)
- [ ] Alerts configured for: API error rate > 1 %, p99 latency > 2 s, Redis disconnected, DB connection pool exhausted

## Data

- [ ] Migrations tested against a production-schema clone before deploy
- [ ] Backup restore tested within the last 30 days
- [ ] Seed script **not** run against production

## CI / CD

- [ ] All 9 CI jobs passing on `main`
- [ ] Deployment gated on CI gate job
- [ ] Rollback procedure documented (see `docs/runbooks/DEPLOYMENT.md`)
