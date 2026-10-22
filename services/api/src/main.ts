import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Express only honours X-Forwarded-For (req.ip) when 'trust proxy' is configured. Default is
  // off so a directly-exposed API cannot be fooled by a client-supplied header.
  const trustProxy = app.get(ConfigService).get<boolean | number>('trustProxy', false);
  app.set('trust proxy', trustProxy);
  configureApp(app);
  await app.listen(app.get(ConfigService).getOrThrow<number>('port'), '0.0.0.0');
}
void bootstrap();
