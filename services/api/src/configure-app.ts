import { ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, raw, urlencoded } from 'express';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { securityHeaders } from './common/middleware/security.middleware';
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const bodyLimit = config.get<number>('maxRequestBodyBytes', 262_144);
  app.use(securityHeaders);
  // Stripe webhook signature verification requires the raw, unparsed body — registered ahead
  // of the global JSON parser for this one path only; every other route stays JSON-parsed.
  app.use('/api/v1/billing/stripe/webhook', raw({ type: 'application/json', limit: bodyLimit }));
  app.use(json({ limit: bodyLimit, strict: true }));
  app.use(urlencoded({ limit: bodyLimit, extended: false, parameterLimit: 100 }));
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  app.useGlobalFilters(app.get(ApiExceptionFilter));
  app.enableCors({
    origin: config.get<string[]>('corsOrigins', []),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.enableShutdownHooks();
  if (config.get<boolean>('enableSwagger', false)) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('FasalGuard AI API')
        .setDescription('FasalGuard AI modular-monolith REST API')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
      swaggerOptions: { persistAuthorization: false },
    });
  }
}
