import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    // Connect lazily — do not throw here so the process stays alive
    // when the database is temporarily unavailable.
    await this.$connect().catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
