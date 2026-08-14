import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse, ReadinessResponse } from '@alims/contracts';

/**
 * Smoke-test and dependency probes (api_specification.md §16).
 * Deliberately exposes no build paths, versions of dependencies, or
 * internal hostnames — PRD §9.1 forbids leaking system detail.
 */
@ApiTags('system')
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

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

  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe with dependency checks' })
  @ApiOkResponse({ description: 'Dependency status' })
  ready(): ReadinessResponse {
    // Real probes are wired in T-003 once Prisma, Redis and S3 clients exist.
    return {
      status: 'ok',
      checks: { database: 'unknown', redis: 'unknown', storage: 'unknown' },
      timestamp: new Date().toISOString(),
    };
  }
}
