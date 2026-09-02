import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global so every module shares one connection pool. Exporting the service
 * rather than PrismaClient keeps `withTenant` the only sanctioned way to
 * reach tenant-scoped data.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
