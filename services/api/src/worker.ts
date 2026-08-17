import 'reflect-metadata';
import { Logger } from 'nestjs-pino';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  if (process.env.PROCESS_ROLE !== 'worker')
    throw new Error('Worker entry point requires PROCESS_ROLE=worker.');
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

void bootstrap();
