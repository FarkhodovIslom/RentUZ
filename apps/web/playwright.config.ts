import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 3 E2E (3_Phase.md §3). Boots the built API (:4000) + web (:3000)
 * against the docker stack; CI mirrors this via services (0_Phase.md §8).
 * Requires prior builds: `pnpm --filter api build && pnpm --filter web build`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../api',
      port: 4000,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        // E2E is self-contained on :4000 even when this worktree's dev API
        // runs on :4100 (parallel phase development).
        PORT: '4000',
        // Background jobs must not race the specs' users/properties, and the
        // register-per-spec flow would eventually trip the 5/h IP throttle on
        // repeat local runs (Redis persists between runs).
        DISABLE_JOBS: 'true',
        DISABLE_THROTTLE: 'true',
      },
    },
    {
      command: 'pnpm start',
      port: 3000,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        INTERNAL_API_URL: 'http://localhost:4000',
        NEXT_PUBLIC_SOCKET_URL: 'http://localhost:4000',
      },
    },
  ],
});
