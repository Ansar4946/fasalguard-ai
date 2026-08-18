import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma is intentionally inspection-only. TypeORM remains the runtime ORM and
// the sole migration authority for FasalGuard.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
