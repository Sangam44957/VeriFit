# Docker Setup

Local development infrastructure for VeriFit: PostgreSQL 16 and Redis 7.

> **Security notice:** Both services bind to `127.0.0.1` only and use fixed development credentials (`verifit`/`verifit`). These settings are not suitable for shared, cloud, or any network-reachable host. Do not expose these ports or credentials outside a local development machine.

## Prerequisites

- Docker with Compose plugin (`docker compose version`)
- pnpm ≥ 11
- Node.js ≥ 24

## Environment

Copy the root example and fill in values:

```sh
cp .env.example .env.local
```

Key variables (see `.env.example` for full list):

| Variable       | Default                                               | Used by      |
| -------------- | ----------------------------------------------------- | ------------ |
| `DATABASE_URL` | `postgresql://verifit:verifit@localhost:5432/verifit` | Prisma / API |
| `REDIS_HOST`   | `localhost`                                           | Worker       |
| `REDIS_PORT`   | `6379`                                                | Worker       |
| `API_PORT`     | `3001`                                                | API          |
| `WORKER_PORT`  | `3002`                                                | Worker       |
| `CORS_ORIGINS` | `http://localhost:3000`                               | API          |

## Start services

```sh
docker compose up -d
```

Verify both containers are healthy:

```sh
docker compose ps
```

## Database setup

Run migrations then seed:

```sh
pnpm db:migrate
pnpm db:seed
```

`db:migrate` runs `prisma migrate dev` against the local PostgreSQL container.  
`db:seed` is safe to re-run — it uses upsert and will not duplicate data.

## Prisma Studio

```sh
pnpm db:studio
```

Opens the Prisma data browser at `http://localhost:5555`.

## Health endpoints

Worker (`http://localhost:3002`):

```sh
curl http://localhost:3002/health/live
# {"status":"alive"}

curl http://localhost:3002/health/ready
# {
#   "status": "healthy",
#   "timestamp": "...",
#   "uptime": 1234,
#   "redis": { "status": "connected", "latency": 1 },
#   "workers": { "registered": [] }
# }
```

## Stop services

```sh
docker compose down
```

To also remove volumes (destroys local database data):

```sh
docker compose down -v
```

## Logs

```sh
docker compose logs postgres
docker compose logs redis
```
