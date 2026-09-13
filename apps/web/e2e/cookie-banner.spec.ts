import { test, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Phase 8 §99 / 8_Phase.md §1.8 item 46: the cookie notice shows once, then
 * stays dismissed (localStorage). The suite's storageState pre-dismisses the
 * banner for the other specs; this file opts back IN by clearing the key via
 * an init script on a fresh context.
 */
test('cookie banner appears and stays dismissed after acknowledge', async ({ browser }) => {
  // Fresh context; strip the suite-wide dismissal before any page script runs.
  const context: BrowserContext = await browser.newContext({
    baseURL: 'http://localhost:3000',
    storageState: { cookies: [], origins: [] },
  });
  const page: Page = await context.newPage();
  // The fresh context starts with empty localStorage — no init script needed
  // (one that ran on every navigation would delete the dismissal we write).

  await page.goto('/');
  const banner = page.getByTestId('cookie-banner');
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('link', { name: /maxfiylik/i })).toBeVisible();

  await banner.getByRole('button', { name: /tushunarli/i }).click();
  await expect(banner).toBeHidden();

  // Persists across navigation.
  await page.goto('/rentals');
  await expect(banner).toBeHidden();

  const stored = await page.evaluate(() => localStorage.getItem('rentuz:cookie-consent'));
  expect(stored).toBe('dismissed');
  await context.close();
});
