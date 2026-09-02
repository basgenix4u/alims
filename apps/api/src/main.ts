import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { corsOrigins, validateEnv } from './config/env';
import { ProblemDetailsFilter } from './interface/filters/problem-details.filter';
import { tenantContextMiddleware } from './interface/middleware/tenant-context';

async function bootstrap(): Promise<void> {
  const env = validateEnv(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const logger = new Logger('Bootstrap');

  // Behind a load balancer, req.ip must reflect X-Forwarded-For or every
  // client looks like the proxy and per-IP rate limiting collapses.
  // 'loopback, linklocal, uniquelocal' trusts only private hops, so a
  // client cannot spoof the header from the public internet.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

  // Tenant context store (T-103). Registered first so every request runs
  // inside an AsyncLocalStorage store that guards can fill in later.
  app.use(tenantContextMiddleware);

  // Required to read the httpOnly refresh cookie (contract §1).
  app.use(cookieParser());

  // OWASP A05 — secure headers by default.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: env.NODE_ENV === 'production',
    }),
  );

  app.enableCors({
    origin: corsOrigins(env),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ALIMS API')
      .setDescription('The Global Academic Knowledge Infrastructure — see api_specification.md')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/v1/docs', app, SwaggerModule.createDocument(app, config));
  }

  // Bind 0.0.0.0 so the service is reachable from outside the container.
  await app.listen(env.API_PORT, '0.0.0.0');
  logger.log(`ALIMS API listening on port ${env.API_PORT} (${env.NODE_ENV})`);
  logger.log(`Health: http://localhost:${env.API_PORT}/api/v1/health`);
}

void bootstrap();
