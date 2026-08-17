import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { DataSource } from 'typeorm';
import { databaseEntities } from './entities';
import { databaseMigrations } from './migrations';
loadEnvironment();
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL is required for TypeORM CLI operations.');
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
  entities: databaseEntities,
  migrations: databaseMigrations,
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  applicationName: 'fasalguard-api-migrations',
  extra: { options: '-c timezone=UTC' },
});
