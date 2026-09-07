# VeriFit Phase 0 Audit

Date: 2026-09-07

## Scope

This audit covers the current worktree, including:

- Root scripts, Turbo configuration, environment examples, Docker Compose, and setup documentation.
- All source and test files under `apps/`.
- All source, Prisma schema, migration, seed, and package configuration files under `packages/`.
- The implemented API, worker, and web routes.
- Lint, typecheck, test, and production build behavior.

This is an audit of the current implementation. It does not assume that empty domain packages are complete merely because they compile.

## Executive Summary

Phase 0 has a usable monorepo skeleton and a small health-check slice, but it is not yet a complete application foundation:

- Existing tests pass, but they cover only four API health tests, three worker service tests, and three static home-page tests.
- The repository does not currently pass lint, typecheck, or production build as run from the workspace root.
- The documented quick-start flow is not reliable because environment-file loading is inconsistent.
- The worker process starts an Express health server but does not register or process any BullMQ workers.
- The web health page reports `Operational` without contacting any service.
- The domain packages for auth, evidence, ranking, scoring, connectors, queues, LLM, validation, audit, and telemetry are empty entry points.
- There are no candidate, company, authentication, evidence, ranking, scoring, queue-submission, or CRUD API endpoints.

The phase is therefore best described as **initial infrastructure scaffolding**, not as a completed platform foundation.

## Validation Results

Commands were run from `/home/sangam/Desktop/VeriFit` on 2026-09-07.

| Command             | Result  | Details                                                                                                          |
| ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`         | Failed  | Database has two forbidden non-null assertions; worker has a useless constructor.                                |
| `pnpm typecheck`    | Failed  | `packages/database/prisma/seed.ts` is included outside the configured `rootDir`.                                 |
| `pnpm test`         | Passed  | API: 4 tests; worker: 3 tests; web: 3 tests. Twelve other packages have no test script and are skipped by Turbo. |
| `pnpm build`        | Failed  | Database cannot resolve `@nestjs/common`; its generic `$queryRaw` wrapper also has an incompatible return type.  |
| `pnpm format:check` | Not run | Not part of the initial validation batch; run after audit changes if formatting is required.                     |

### Post-audit validation (2026-09-07)

| Command          | Result | Details                                                                 |
| ---------------- | ------ | ----------------------------------------------------------------------- |
| `pnpm lint`      | ✅     | 15/15 packages, 0 errors                                                |
| `pnpm typecheck` | ✅     | 15/15 packages, 0 errors                                                |
| `pnpm build`     | ✅     | 15/15 packages, 0 errors                                                |
| `pnpm test`      | ✅     | 27 tests across 4 packages (api: 7, worker: 12, web: 6, database: 2)   |

### Phase 0.5 validation — auth vertical slice (2026-09-07)

| Command          | Result | Details                                                                                 |
| ---------------- | ------ | --------------------------------------------------------------------------------------- |
| `pnpm typecheck` | ✅     | 15/15 packages, 1.794s (13 cached)                                                      |
| `pnpm build`     | ✅     | 15/15 packages, 14.313s (11 cached)                                                     |
| `pnpm test`      | ✅     | 52 tests across 5 packages (api: 16, auth: 8, web: 14, worker: 12, database: 2), 4.07s |

Web build routes:

| Route               | Type    | Size    |
| ------------------- | ------- | ------- |
| `/`                 | Static  | 131 B   |
| `/login`            | Static  | 1.07 kB |
| `/api/auth/login`   | Dynamic | 131 B   |
| `/health`           | Dynamic | 131 B   |

The passing test result must not be treated as evidence that the application works end to end. The current tests are mostly isolated unit or render tests and do not boot the applications or exercise real HTTP requests.

## Endpoint Inventory

### API

| Endpoint                   | Status                    | Review                                                                                                                      |
| -------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`  | Implemented               | Process liveness only. It should not be expected to prove database or Redis availability.                                   |
| `GET /api/v1/health/ready` | Implemented               | Executes `SELECT 1` through Prisma and returns dependency readiness. No HTTP integration test verifies the actual response. |
| `/api/docs`                | Conditionally implemented | Exposed when `API_DOCS_ENABLED=true`; no authentication or authorization protects the documentation route.                  |

There are no API endpoints for authentication, users, organizations, candidates, resumes, evidence, job descriptions, scoring, ranking, queues, exports, or notifications.

### Worker

| Endpoint            | Status      | Review                                                                                                    |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `GET /health/live`  | Implemented | Returns a static liveness response. No route-level test exists.                                           |
| `GET /health/ready` | Implemented | Checks Redis and lists registered workers, but no workers are registered. The Redis check has no timeout. |

The worker does not currently process jobs. `WorkerManager` owns an empty map and never constructs a BullMQ `Worker`.

### Web

| Route         | Status                     | Review                                                                              |
| ------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| `GET /`       | Implemented                | Static landing page with a health link.                                             |
| `GET /health` | Implemented but misleading | Always renders `Operational`; it does not call the API, worker, Redis, or database. |


- `

### Web

- `apps/web/src/app/page.tsx`: static page is covered by tests, but it is only a shell.
- `apps/web/src/app/health/page.tsx`: status is not backed by a service check and has no test.
- `apps/web/src/app/layout.tsx` and `globals.css`: verify metadata, accessibility, responsive behavior, and error/loading states as the UI grows.
- Several installed UI/state/form/query libraries currently have no consumers. Keep them only if they are part of the immediate implementation plan; otherwise defer installation to reduce dependency surface.

### Database

- `packages/database/src/index.ts`: Prisma 7 adapter setup is a reasonable direction, but the package dependency boundary and generic query wrapper currently prevent a clean build. Avoid a hand-written `$queryRaw` forwarding method unless it is actually needed; consumers can use the exposed Prisma client or a typed repository method.
- `packages/database/prisma.config.ts`: configuration requires an environment variable at CLI load time, so its environment-loading contract must match the package scripts and README.
- `packages/database/prisma/schema.prisma`: contains the first domain model, but identity relations and constraints need a schema-level review before application features are built.
- `packages/database/prisma/seed.ts`: should avoid non-null assertions and have an integration test proving idempotency.
- `packages/database/prisma/migrations/`: migration presence is good, but there is no automated migration/seed verification in the test suite.

### Domain packages

The following packages currently contain only an empty `src/index.ts` or equivalent placeholder and provide no runtime functionality:

`audit`, `auth`, `connectors`, `evidence`, `jd-engine`, `llm`, `queue`, `ranking`, `scoring`, `telemetry`, and `validation`.

This is not inherently wrong for a phase-0 scaffold, but it means no business functionality is currently available and no meaningful line-by-line behavior review is possible in those files.

## Library and Simplification Recommendations

These are recommendations, not mandatory rewrites:

1. Use Node 24's native `--env-file` consistently instead of adding multiple environment-loading conventions. Keep `@nestjs/config` if it becomes the single API configuration source.
2. Prefer Nest Terminus for API health checks, since it is already a dependency, but test the resulting HTTP contract. Do not add another health library.
3. Do not hand-roll queue lifecycle behavior. Use BullMQ's `Worker`, `Queue`, `QueueEvents`, and documented shutdown APIs once job contracts are defined.
4. Remove the custom Prisma `$queryRaw` forwarding wrapper unless it provides a real abstraction. Prisma already exposes typed query methods.
5. Keep Express for the worker if job/admin endpoints are imminent; otherwise a smaller native HTTP health server is sufficient, but changing frameworks now is lower priority than implementing worker registration.
6. Remove unused web dependencies until the first feature needs them. `react-hook-form`, Zustand, React Query, Radix Slot, and class-variance-authority currently add install and audit surface without behavior.
7. Use a schema validation library already present in the workspace, such as Zod, for process configuration where it reduces duplicated parsing. Keep Nest's `ValidationPipe` for HTTP DTO validation once DTOs exist.

## Required Functionality Before Phase 0 Can Be Called Complete

- ~~Make root lint, typecheck, and build pass in a clean install.~~ ✅
- Make the documented environment setup work from a fresh checkout.
- ~~Add an API integration test for both health endpoints, including status codes and route prefix.~~ ✅
- ~~Add worker route tests, Redis timeout tests, and a deterministic shutdown test.~~ ✅
- Decide whether phase 0 includes actual BullMQ worker registration. If yes, implement and test it; if no, remove claims that the worker processes jobs.
- Make the web health page query real service health or label itself as a static demo.
- ~~Add database migration, seed idempotency, and schema constraint tests.~~ ✅
- Define the first domain boundary and implement at least one vertical slice, such as authentication or candidate intake, instead of leaving every business package empty.
- Add CI that runs lint, typecheck, build, tests, and format checking from a clean dependency install.

## Suggested Test Matrix

| Area          | Status | Minimum test                                                                                  |
| ------------- | ------ | --------------------------------------------------------------------------------------------- |
| API bootstrap | ✅     | Nest application starts with test configuration and applies `/api/v1` prefix.                 |
| API live      | ✅     | `GET /api/v1/health/live` returns the intended status and body.                               |
| API ready     | ✅     | Database success returns `200`; database failure returns `503`.                               |
| API config    | ✅     | Invalid port, CORS, boolean, and missing database settings fail clearly.                      |
| Worker live   | ✅     | Route returns the documented body.                                                            |
| Worker ready  | ✅     | Redis success, Redis failure, and timeout return bounded responses.                           |
| Worker jobs   | ⬜     | Registered queues create workers, process a test job, retry failures, and close cleanly.      |
| Web health    | ⬜     | Loading, healthy, degraded, and unavailable states are rendered from actual responses.        |
| Database      | ✅     | Migration applies, seed is idempotent, and foreign-key constraints reject invalid data.       |
| Setup         | ⬜     | A clean local setup runs the documented commands without manually exporting hidden variables. |
| Packages      | ⬜     | Every non-placeholder domain package has at least a contract test once it contains behavior.  |

## Phase 0.5 — Auth Vertical Slice

### Endpoints added

| Endpoint                | Method | Description                                                      |
| ----------------------- | ------ | ---------------------------------------------------------------- |
| `/api/v1/auth/register` | POST   | Creates a user; returns `{ id, email, role }`                    |
| `/api/v1/auth/login`    | POST   | Verifies password; returns `{ accessToken }` (JWT, 1h expiry)   |

### Packages implemented

| Package         | What was added                                                                          |
| --------------- | --------------------------------------------------------------------------------------- |
| `packages/auth` | `hashPassword`, `verifyPassword`, `signJwt`, `verifyJwt`; JWT payload type             |
| `apps/api`      | `AuthModule`, `AuthService`, `AuthController`, DTOs with class-validator                |
| `apps/web`      | `/login` page with form; `/api/auth/login` Next.js route handler; httpOnly cookie       |

### Schema changes

| Change                          | Migration |
| ------------------------------- | --------- |
| Add `passwordHash String` to `User` | Applied   |

### Notable fixes during verification

- `packages/database/src/index.ts` — added `export { Role } from '@prisma/client'` so `apps/api` doesn't need `@prisma/client` as a direct dependency; `auth.dto.ts` imports `Role` from `@verifit/database`.
- `apps/api/vitest.config.ts` — added `unplugin-swc` plugin; without it `emitDecoratorMetadata` was not emitted during test transforms, causing NestJS constructor injection to resolve `authService` as `undefined` at runtime (all 9 `auth.controller.spec.ts` tests returned 500).

## Final Assessment

The project has a reasonable starting structure, but the current implementation is a scaffold with health demonstrations rather than a tested platform foundation. The most urgent work is to make the repository green, make environment loading deterministic, and decide whether the worker and web health surfaces are real operational components or explicitly static placeholders. After that, the project needs one complete domain vertical slice and integration coverage before broader package-level expansion will be meaningful.

### Phase 0 completion status

**Green** — `pnpm typecheck`, `pnpm build`, and `pnpm test` all pass (27 tests, 0 failures).

### Phase 0.5 completion status

**Green** — `pnpm typecheck`, `pnpm build`, and `pnpm test` all pass (52 tests, 0 failures). Auth vertical slice is complete. Remaining open items:

1. BullMQ worker registration decision (implement or explicitly mark as out of scope)
2. Web health page — real service check or labelled static demo
3. CI pipeline (lint → typecheck → build → test → format check)
4. Clean-checkout env verification
