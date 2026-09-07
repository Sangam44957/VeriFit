# Performance Baseline

Targets for Phase 0 infrastructure. Measured values will be added as load testing is introduced in later phases.

## API targets

| Endpoint                   | p50     | p99      | Error rate |
| -------------------------- | ------- | -------- | ---------- |
| `GET /api/v1/health/live`  | < 5 ms  | < 20 ms  | 0 %        |
| `GET /api/v1/health/ready` | < 20 ms | < 100 ms | 0 %        |

## Database

| Metric                          | Target              |
| ------------------------------- | ------------------- |
| Migration apply time (full set) | < 30 s              |
| Simple primary-key lookup       | < 5 ms              |
| Connection pool size            | 10 (default Prisma) |

## Redis

| Metric                             | Target                             |
| ---------------------------------- | ---------------------------------- |
| PING latency (local)               | < 1 ms                             |
| PING latency (same-region managed) | < 5 ms                             |
| `maxmemory-policy`                 | `noeviction` (required for BullMQ) |

## Worker

| Metric                            | Target  |
| --------------------------------- | ------- |
| `GET /health/live` response time  | < 10 ms |
| `GET /health/ready` response time | < 50 ms |

## CI pipeline

| Job                         | Target duration |
| --------------------------- | --------------- |
| quality                     | < 3 min         |
| tests                       | < 5 min         |
| build                       | < 5 min         |
| db-migrations               | < 3 min         |
| Total wall-clock (parallel) | < 10 min        |

## Notes

- Baselines are aspirational for Phase 0; no load testing tooling is wired yet.
- Actual measurements will be captured in Phase 2 when the first business endpoints are built.
- `noeviction` policy is non-negotiable — BullMQ requires jobs to never be silently dropped.
