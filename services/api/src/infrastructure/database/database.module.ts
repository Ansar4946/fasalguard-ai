import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { databaseEntities } from './entities';
import { databaseMigrations } from './migrations';
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        url: c.getOrThrow<string>('databaseUrl'),
        ssl: c.get<boolean>('databaseSsl') ? { rejectUnauthorized: true } : false,
        entities: databaseEntities,
        migrations: databaseMigrations,
        synchronize: false,
        migrationsRun: false,
        retryAttempts: 5,
        retryDelay: 2000,
        applicationName: 'fasalguard-api',
        extra: { options: '-c timezone=UTC' },
      }),
    }),
  ],
})
export class DatabaseModule {}
