import { Module } from '@nestjs/common';
import { HealthIndicatorService, TerminusModule } from '@nestjs/terminus';
import { DatabaseModule, PrismaService } from '@verifit/database';

import { DatabaseHealth, DatabaseHealthIndicator } from './database.health.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule, DatabaseModule],
  controllers: [HealthController],
  providers: [
    {
      provide: 'DATABASE_HEALTH',
      useFactory: (prisma: PrismaService): DatabaseHealth => ({
        check: () => prisma.$queryRaw`SELECT 1`.then(() => undefined),
      }),
      inject: [PrismaService],
    },
    {
      provide: DatabaseHealthIndicator,
      useFactory: (his: HealthIndicatorService, db: DatabaseHealth) =>
        new DatabaseHealthIndicator(his, db),
      inject: [HealthIndicatorService, 'DATABASE_HEALTH'],
    },
  ],
})
export class HealthModule {}
