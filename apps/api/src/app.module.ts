import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { HealthModule } from './modules/health/health.module';
import { RecordsModule } from './modules/records/records.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    // PRD §9.1 resource-abuse protection. Per-route overrides come with auth (T-100).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    HealthModule,
    RecordsModule,
  ],
})
export class AppModule {}
