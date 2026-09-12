import 'dotenv/config';
import { defineConfig } from 'vitest/config';

/**
 * Integration env comes from apps/api/.env (each worktree can point at its
 * own PostGIS/Redis — e.g. the phase-6 parallel-dev stack on 5435/6380),
 * with the shared local stack as fallback.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Files must run SEQUENTIALLY: each suite truncates shared tables in
    // beforeEach — parallel files would delete each other's fixtures (the
    // root cause behind the Phase 2 "flaky" integration tests; vitest 4
    // removed poolOptions.forks.singleFork and silently parallelized them).
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5434/rentuz?schema=public&search_path=public,extensions',
      DATABASE_DIRECT_URL:
        process.env.DATABASE_DIRECT_URL ??
        'postgresql://postgres:postgres@localhost:5434/rentuz?search_path=public,extensions',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'phase0-dev-secret-change-me',
      AUTH_OTP_DEV_MODE: 'true',
      NODE_ENV: 'test',
      DISABLE_THROTTLE: 'true',
      // Background jobs (fx-rates catch-up on boot!) must never race fixtures.
      DISABLE_JOBS: 'true',
    },
  },
});
