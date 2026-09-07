# VeriFit

Monorepo foundation — API, worker, and web app backed by PostgreSQL and Redis.

## Quick start

```sh
cp .env.example .env.local
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Services after `pnpm dev`:

| App    | URL                   |
| ------ | --------------------- |
| Web    | http://localhost:3000 |
| API    | http://localhost:3001 |
| Worker | http://localhost:3002 |

## Prerequisites

- Node.js ≥ 24
- pnpm ≥ 11
- Docker with Compose

## Project structure

```
apps/
  api/        NestJS REST API (port 3001)
  web/        Next.js frontend (port 3000)
  worker/     BullMQ worker process (port 3002)
packages/
  database/   Prisma schema, migrations, seed
docs/
  adr/        Architecture decision records
  DOCKER_SETUP.md
docker-compose.yml
```

## Scripts

| Script            | Description                        |
| ----------------- | ---------------------------------- |
| `pnpm dev`        | Start all apps in parallel (Turbo) |
| `pnpm build`      | Build all apps and packages        |
| `pnpm test`       | Run all test suites                |
| `pnpm lint`       | Lint all packages                  |
| `pnpm typecheck`  | Type-check all packages            |
| `pnpm format`     | Format with Prettier               |
| `pnpm db:migrate` | Run Prisma migrations (dev)        |
| `pnpm db:seed`    | Seed the database                  |
| `pnpm db:studio`  | Open Prisma Studio                 |

## Infrastructure

`docker-compose.yml` runs two services:

- PostgreSQL 16 on `localhost:5432` — persistent volume `postgres_data`
- Redis 7 on `localhost:6379` — persistent volume `redis_data`, `noeviction` policy for BullMQ

```sh
docker compose up -d      # start
docker compose ps         # status
docker compose logs       # logs
docker compose down       # stop (keeps volumes)
docker compose down -v    # stop and delete volumes
```

See [docs/DOCKER_SETUP.md](docs/DOCKER_SETUP.md) for details.

## Environment

Copy `.env.example` to `.env.local` and adjust values. `.env.local` is git-ignored.

Key variables (names match what the apps actually read):

```
API_PORT=3001              # API process port
CORS_ORIGINS=http://localhost:3000
DATABASE_URL=postgresql://verifit:verifit@localhost:5432/verifit
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
LOG_LEVEL=info
NODE_ENV=development
API_DOCS_ENABLED=true
WORKER_PORT=3002           # Worker process port
```


## Health endpoints

**API** — `GET /api/v1/health/live` and `GET /api/v1/health/ready`

```json
{
  "status": "ok",
  "info": { "database": { "status": "up" } },
  "error": {},
  "details": { "database": { "status": "up" } }
}
```

`/live` checks the process only (no dependencies). `/ready` checks the database.

**Worker** — `GET /health/live` and `GET /health/ready`

`/live` returns `{"status":"alive"}` (process liveness only — no dependency check).

`/ready` checks Redis connectivity and returns:

```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptime": 1234,
  "redis": { "status": "connected", "latency": 1 },
  "workers": { "registered": [] }
}
```

`status` is `"unhealthy"` and `redis.status` is `"disconnected"` when Redis is unreachable. `workers.registered` is always empty — no queue workers are registered yet.

## Database

Migrations live in `packages/database/prisma/migrations/` and are version-controlled.

```sh
pnpm db:migrate   # apply pending migrations
pnpm db:seed      # upsert seed data (idempotent — "VeriFit Demo University")
pnpm db:studio    # open Prisma Studio at http://localhost:5555
```

Never run `prisma migrate reset` unless you intend to destroy local data.
