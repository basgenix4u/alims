import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { PolicyModule } from './domain/policy/policy.module';
import { AuditModule } from './infrastructure/audit/audit.module';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { JwtAuthGuard } from './interface/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { RecordsModule } from './modules/records/records.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    // PRD §9.1 resource-abuse protection. Auth mutations tighten this to
    // 5/min via @Throttle on the individual routes.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    PolicyModule,
    AuthModule,
    HealthModule,
    RecordsModule,
  ],
  providers: [
    // Order matters: throttle before authentication so unauthenticated
    // floods are shed before any Argon2 work is done.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Deny-by-default. Routes opt out explicitly with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
