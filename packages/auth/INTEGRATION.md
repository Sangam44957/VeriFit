# @verifit/auth — Integration Guide

How to wire the auth package into a NestJS application.

## Module setup

`AuthModule` lives in `apps/api/src/auth/auth.module.ts`. It reads validated
configuration from `AppConfigService` and provides `JwtService`, `OAuthService`,
`AuthGuard`, and `RoleGuard` to the rest of the application.

```typescript
// apps/api/src/app.module.ts
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [ConfigModule, AuthModule, ...],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
  ],
})
export class AppModule {}
```

Guards registered as `APP_GUARD` apply to every route. Mark public routes with
`@Public()` to bypass `AuthGuard`.

## Guards

### AuthGuard

Validates the JWT on every non-public request. Accepts the token from either:

- Cookie key `jwt` (browser sessions)
- `Authorization: Bearer <token>` header (API / machine clients)

If both are present the request is rejected — credential confusion is not
silently resolved.

On success, `req.user` is set to an `AuthenticatedUser`:

```typescript
interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string;
  role: UserRole;
}
```

### RoleGuard

Must run after `AuthGuard`. Checks `req.user.role` against the roles declared
with `@AllowRoles`. If no roles are declared the guard passes (authentication
alone is sufficient).

```typescript
@Post('students')
@UseGuards(AuthGuard, RoleGuard)
@AllowRoles('ADMIN', 'STAFF')
async createStudent() {}
```

## Decorators

### @Public()

Skips `AuthGuard` for the decorated handler or controller.

```typescript
@Public()
@Post('login')
login(@Body() dto: LoginDto) {}
```

### @AllowRoles(...roles)

Declares which roles may access the route. Used together with `RoleGuard`.

```typescript
@AllowRoles('ADMIN')
@UseGuards(AuthGuard, RoleGuard)
@Delete('users/:id')
deleteUser() {}
```

### @CurrentUser()

Parameter decorator that extracts `req.user`. Throws `UnauthorizedException` if
no authenticated principal is present (i.e. used without `AuthGuard`).

```typescript
@Get('me')
@UseGuards(AuthGuard)
getMe(@CurrentUser() user: AuthenticatedUser) {
  return user;
}
```

## Services

### JwtService

Generates and verifies tokens. Configured with `secret`, `expiresIn`, `issuer`,
and `audience` — all four are required.

```typescript
const token = jwtService.generateToken({
  sub: user.id,
  email: user.email,
  organizationId: user.organizationId,
  role: user.role,
});

const payload = jwtService.verifyToken(token);
// payload.iss, payload.aud, payload.sub, payload.jti, ...
```

`createTokenRecordMetadata(token, opts?)` extracts the `jti` and `expiresAt`
needed to persist a revocation record.

### OAuthService

Handles the Google OAuth redirect flow. Requires `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`. When those env vars are
absent the provider resolves to `null` and OAuth routes should be disabled.

```typescript
// 1. Initiate — redirect the browser here
const { authorizationUrl } = oauthService.generateAuthorizationUrl(organizationId);

// 2. Callback — called by Google with code + state
const result = await oauthService.handleCallback(code, state, (googleSub, email, orgId) =>
  authRepository.resolveOAuthUser({
    provider: 'google',
    providerUserId: googleSub, // stable Google subject — not email
    providerEmail: email,
    organizationId: orgId,
  }),
);
// result.accessToken — JWT ready to set as cookie
// result.user        — { id, email, organizationId, role }
```

The identity resolver receives the verified Google subject (`sub`) as the
primary key. Email alone is not sufficient — Google sub is the stable binding.

### AuthorizationService

RBAC + org-scoped access checks. Returns a typed `AuthorizationResult` — does
not throw HTTP exceptions directly (that responsibility belongs to the
guard/controller layer).

```typescript
const result = authorizationService.canAccess(user, {
  organizationId: resource.organizationId,
  requiredRoles: ['ADMIN', 'STAFF'],
});

if (!result.allowed) throw new ForbiddenException(result.reason);
```

## Environment variables

| Variable               | Required | Description                |
| ---------------------- | -------- | -------------------------- |
| `JWT_SECRET`           | ✅       | Min 32 chars, random       |
| `JWT_EXPIRATION`       | ✅       | e.g. `15m`                 |
| `JWT_ISSUER`           | ✅       | e.g. `verifit`             |
| `JWT_AUDIENCE`         | ✅       | e.g. `verifit-api`         |
| `GOOGLE_CLIENT_ID`     | optional | OAuth disabled when absent |
| `GOOGLE_CLIENT_SECRET` | optional | OAuth disabled when absent |
| `GOOGLE_REDIRECT_URI`  | optional | OAuth disabled when absent |

## Error responses

| Exception               | When                                              |
| ----------------------- | ------------------------------------------------- |
| `UnauthorizedException` | Missing token, invalid/expired JWT, revoked token |
| `ForbiddenException`    | Insufficient role                                 |

## Testing

```typescript
import { Test } from '@nestjs/testing';
import { AuthModule } from './auth.module.js';
import { ConfigModule } from '../config/config.module.js';
import { PrismaService } from '@verifit/database';

const module = await Test.createTestingModule({
  imports: [ConfigModule, AuthModule],
})
  .overrideProvider(PrismaService)
  .useValue(prismaMock)
  .compile();

const jwtService = module.get(JwtService);
const token = jwtService.generateToken({
  sub: 'u1',
  email: 'x@x.com',
  organizationId: 'org-1',
  role: 'STUDENT',
});
const payload = jwtService.verifyToken(token);
expect(payload.iss).toBe('verifit');
```

See `apps/api/src/auth/auth.module.spec.ts` for the full wiring test suite.
