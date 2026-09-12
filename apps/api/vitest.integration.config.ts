import { defineConfig } from 'vitest/config';

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
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/rentuz?schema=public&search_path=public,extensions',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'phase0-dev-secret-change-me',
      AUTH_OTP_DEV_MODE: 'true',
      NODE_ENV: 'test',
      DISABLE_THROTTLE: 'true',
      // Background jobs (fx-rates catch-up on boot!) must never race fixtures.
      DISABLE_JOBS: 'true',
    },
  },
});
