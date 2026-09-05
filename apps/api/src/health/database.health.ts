import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

export interface DatabaseHealth {
  check(): Promise<void>;
}

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly databaseHealth: DatabaseHealth,
  ) {}

  async check(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check('database');
    try {
      await this.databaseHealth.check();
      return indicator.up();
    } catch {
      return indicator.down();
    }
  }
}
