import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse, ReadinessResponse } from '@alims/contracts';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Public } from '../../interface/decorators/public.decorator';

/**
 * Smoke-test and dependency probes (api_specification.md §16).
 * Deliberately exposes no build paths, versions of dependencies, or
 * internal hostnames — PRD §9.1 forbids leaking system detail.
 *
 * Public: orchestrator probes cannot present a bearer token.
 */
@ApiTags('system')
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  // Explicit token: the test runner compiles without emitDecoratorMetadata,
  // so type-only injection would resolve to undefined there.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ description: 'Service is alive' })
  health(): HealthResponse {
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe with dependency checks' })
  @ApiOkResponse({ description: 'Dependency status' })
  async ready(): Promise<ReadinessResponse> {
    const database = (await this.prisma.isHealthy()) ? 'up' : 'down';
    // Redis and object storage arrive with T-2xx (Agent 2); reported as
    // 'unknown' rather than faking 'up'.
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      checks: { database, redis: 'unknown', storage: 'unknown' },
      timestamp: new Date().toISOString(),
    };
  }
}
