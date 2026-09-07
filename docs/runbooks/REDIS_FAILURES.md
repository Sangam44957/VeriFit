# Runbook: Redis Failures

## Symptoms

- Worker `/health/ready` returns `{"status":"unhealthy","redis":{"status":"disconnected"}}`
- BullMQ jobs not processing
- Application logs contain `ECONNREFUSED 127.0.0.1:6379` or `Redis connection error`

## Diagnosis

```sh
# 1. Check container / service status
docker compose ps

# 2. Check Redis logs
docker compose logs redis --tail=50

# 3. Verify connectivity
docker compose exec redis redis-cli PING
# Expected: PONG

# 4. Verify maxmemory-policy (must be noeviction for BullMQ)
docker compose exec redis redis-cli CONFIG GET maxmemory-policy
# Expected: noeviction
```

## Remediation

### Container not running

```sh
docker compose up -d redis
# Wait for healthy status
docker compose ps
```

### Wrong maxmemory-policy

The `docker-compose.yml` sets `--maxmemory-policy noeviction` at startup. If it has been changed at runtime:

```sh
docker compose exec redis redis-cli CONFIG SET maxmemory-policy noeviction
```

Then fix the root cause — do not allow runtime config drift.

### Worker not reconnecting after Redis restart

The worker uses `ioredis` with built-in reconnect logic. If it does not reconnect automatically within 30 seconds, restart the worker process:

```sh
# Development
pnpm --filter @verifit/worker dev
```

### Memory pressure (production)

If Redis is approaching its memory limit:

1. Check memory usage: `docker compose exec redis redis-cli INFO memory`
2. Identify large keys: `docker compose exec redis redis-cli --bigkeys`
3. Do **not** change `maxmemory-policy` away from `noeviction` — this would silently drop BullMQ jobs
4. Instead, increase the memory limit or reduce job retention settings

## Escalation

If Redis is unreachable on the managed service and the above steps do not resolve it within 15 minutes, escalate to the infrastructure owner. BullMQ jobs will queue in memory temporarily but will be lost if the worker process restarts.

## Prevention

- `maxmemory-policy noeviction` is enforced in `docker-compose.yml` — do not change it
- Monitor Redis memory utilisation; alert at 75 % of limit
- Monitor worker `/health/ready` endpoint; alert on `status: unhealthy`
