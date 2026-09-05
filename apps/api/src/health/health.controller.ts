import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { DatabaseHealthIndicator } from './database.health.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness check',
    description: 'Confirms that the API process is alive.',
  })
  @ApiResponse({ status: 200, description: 'API process is alive.' })
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness check',
    description: 'Confirms that required API dependencies are available.',
  })
  @ApiResponse({ status: 200, description: 'API is ready to receive traffic.' })
  @ApiResponse({
    status: 503,
    description: 'API is not ready because a required dependency is unavailable.',
  })
  ready() {
    return this.health.check([() => this.database.check()]);
  }
}
