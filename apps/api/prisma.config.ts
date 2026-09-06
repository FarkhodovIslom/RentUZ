import { defineConfig } from 'prisma/config';

// Prisma 7 CLI configuration. The CLI does not read .env files by itself —
// load dotenv explicitly so local runs get DATABASE_DIRECT_URL. Migrations
// run against the direct URL; the app connects via DATABASE_URL (pooled in
// prod) through @prisma/adapter-pg.
// 0_Phase.md §5: dev db is on host port 5433 (5432 is taken by other stacks).
import 'dotenv/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
