import { expect, test } from '@playwright/test';
import { firstActiveSlug, loginBrowser, provisionUser } from './helpers';

/**
 * §3 spec 5 — logged-in tenant: details → "Saqlash" → toast "Saqlandi" →
 * /favorites shows the saved card.
 */
test('tenant saves a property from the details page', async ({ page }) => {
  const user = await provisionUser();
  await loginBrowser(page, user);

  const slug = await firstActiveSlug(page);
  await page.goto(`/property/${slug}`);

  // The detail heart lives in the sidebar <aside>; the "O'xshash e'lonlar"
  // cards have identical heart buttons, so scope to the sidebar.
  await page.locator('aside').getByRole('button', { name: 'Saqlash' }).click();

  // Toast feedback + active heart.
  await expect(page.getByRole('status')).toContainText('Saqlandi');
  await expect(page.getByRole('button', { name: 'Saqlangan', exact: true })).toBeVisible();

  // The saved card appears on /favorites.
  await page.goto('/favorites');
  await expect(
    page.getByRole('heading', { name: "Saqlangan e'lonlar", exact: true }),
  ).toBeVisible();
  await expect(page.locator(`a[href="/property/${slug}"]`)).toBeVisible();
});
