import { expect, test } from '@playwright/test';
import { provisionUser, loginBrowser, provisionProperty } from './helpers';

/**
 * §3 — tenant submits a rental request from the details page modal; it
 * appears in /rental-requests under the Kutayotgan tab.
 */
test('tenant submits a rental request from the details page', async ({ page }) => {
  const { slug } = await provisionProperty();
  const tenant = await provisionUser();
  await loginBrowser(page, tenant);

  await page.goto(`/property/${slug}`);
  // Sidebar detail heart lives in <aside>; the modal opener sits next to it.
  await page.locator('aside').getByRole('button', { name: "Ijara so'rovi" }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await page.getByLabel('Xabar (kamida 20 belgi)').fill(
    'Salom! Bu kvartirani 1 yilga ijaraga olmoqchiman. Narx muhokama mumkinmi?',
  );
  await page.getByLabel('Boshlanish sanasi').fill(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  await page.getByLabel('Davomiylik (oy)').fill('12');
  await page.getByRole('button', { name: 'Yuborish' }).click();

  // The modal flips to the stable inline success state (§1.3 item 13).
  await expect(page.getByRole('status').first()).toContainText("So'rov yuborildi");

  // The request shows in the tenant's list under the PENDING tab.
  await page.goto('/rental-requests?status=PENDING');
  await expect(page.getByRole('link', { name: 'E2E Ijara uyi — Toshkent markazi' })).toBeVisible();
  await expect(page.getByText('Kutayotgan').first()).toBeVisible();
});
