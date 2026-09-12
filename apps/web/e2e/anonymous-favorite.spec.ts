import { expect, test } from '@playwright/test';
import { firstActiveSlug, provisionUser } from './helpers';

/**
 * §3 spec 4 — anonymous details → "Saqlash" → login redirect → after login
 * the favorite replays (heart active + toast) on the same property.
 */
test('anonymous favorite survives the login round trip', async ({ page }) => {
  const slug = await firstActiveSlug(page);
  const user = await provisionUser(); // browser stays anonymous

  await page.goto(`/property/${slug}`);
  // The detail heart lives in the sidebar <aside>; the "O'xshash e'lonlar"
  // cards have identical heart buttons, so scope to the sidebar.
  await page.locator('aside').getByRole('button', { name: 'Saqlash' }).click();

  // Anonymous click → login with a `next` back to the property.
  await expect(page).toHaveURL(/\/login\?next=/);

  await page.getByLabel('Telefon raqam').fill(user.phone);
  await page.getByLabel('Parol').fill(user.password);
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();

  // Back on the property page; the pending favorite replays.
  await expect(page).toHaveURL(new RegExp(`/property/${slug}`));
  await expect(page.getByRole('button', { name: 'Saqlangan', exact: true })).toBeVisible();
});
