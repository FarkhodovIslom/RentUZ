import { defineConfig } from 'prisma/config';

// Prisma 7 CLI configuration. Migrations run against DATABASE_DIRECT_URL
// (direct connection); the app connects via DATABASE_URL (pooled in prod).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
