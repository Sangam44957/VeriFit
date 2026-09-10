import { Injectable, OnModuleDestroy, OnModuleInit, Global, Module } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

export { Role, AccountStatus } from '@prisma/client';

/** Mirrors OAuthStateStore from @verifit/auth — defined here to avoid a circular dependency. */
export interface OAuthStateStore {
  set(state: string, meta: { expiresAt: Date; organizationId?: string }): void;
  consume(
    state: string,
  ):
    | { expiresAt: Date; organizationId?: string }
    | Promise<{ expiresAt: Date; organizationId?: string }>;
}

export interface CreateTokenInput {
  userId: string;
  jti: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface ResolveOAuthUserInput {
  provider: string;
  providerUserId: string;
  providerEmail?: string;
  organizationId?: string;
}

export interface ResolvedOAuthUser {
  id: string;
  email: string;
  organizationId: string;
  role: string;
  accountStatus: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// PrismaService must be declared before AuthRepository and DbOAuthStateStore
// to avoid a TDZ (temporal dead zone) error under ESM + decorator evaluation.
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor() {
    const adapter = new PrismaPg({
      connectionString: requireEnv('DATABASE_URL'),
    });
    this.client = new PrismaClient({ adapter });
  }

  async onModuleInit(): Promise<void> {
    // Connect lazily — do not throw here so the process stays alive
    // when the database is temporarily unavailable.
    await this.client.$connect().catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  createToken(input: CreateTokenInput) {
    return this.prisma.client.authToken.create({ data: input });
  }

  findByJti(jti: string) {
    return this.prisma.client.authToken.findUnique({ where: { jti } });
  }

  revoke(jti: string) {
    return this.prisma.client.authToken.update({
      where: { jti },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Resolve an existing User from a verified OAuth provider identity.
   * Looks up OAuthConnection by (provider, providerUserId) — the verified
   * provider subject — never by email.
   *
   * Unknown identities are denied: users must be pre-created by an admin.
   * This is intentional for a campus placement system where membership
   * must not be granted merely because someone has a Google account.
   */
  async resolveOAuthUser(
    input: ResolveOAuthUserInput,
  ): Promise<ResolvedOAuthUser> {
    const connection = await this.prisma.client.oAuthConnection.findUnique({
      where: {
        provider_providerUserId: {
          provider: input.provider,
          providerUserId: input.providerUserId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            organizationId: true,
            role: true,
            accountStatus: true,
          },
        },
      },
    });

    if (!connection) {
      throw new Error('No account found for this Google identity. Contact your administrator.');
    }

    await this.prisma.client.oAuthConnection.update({
      where: { id: connection.id },
      data: { lastUsedAt: new Date(), providerEmail: input.providerEmail },
    });

    return connection.user;
  }
}

@Injectable()
export class DbOAuthStateStore implements OAuthStateStore {
  constructor(private readonly prisma: PrismaService) {}

  set(state: string, meta: { expiresAt: Date; organizationId?: string }): void {
    // Fire-and-forget — callers don't await set(); errors surface on consume().
    void this.prisma.client.oAuthState.create({ data: { state, expiresAt: meta.expiresAt } });
  }

  async consume(state: string): Promise<{ expiresAt: Date; organizationId?: string }> {
    // Atomic delete-and-return: if the row doesn't exist the delete throws P2025.
    const record = await this.prisma.client.oAuthState
      .delete({ where: { state } })
      .catch((e: { code?: string }) => {
        if (e?.code === 'P2025') throw new Error('Invalid state parameter (CSRF protection)');
        throw e;
      });
    if (record.expiresAt < new Date())
      throw new Error('State parameter expired. Please restart login.');
    return { expiresAt: record.expiresAt };
  }
}

@Global()
@Module({
  providers: [PrismaService, AuthRepository, DbOAuthStateStore],
  exports: [PrismaService, AuthRepository, DbOAuthStateStore],
})
export class DatabaseModule {}
