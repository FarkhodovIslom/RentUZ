import { expect, test } from '@playwright/test';

/**
 * §3 spec 1 — anonymous home → quick chip → /rentals?rooms=2 → apply max
 * price in the filter drawer → URL updates (§63) and results re-render.
 */
test('home chip lands on rentals with params; max price filter updates the URL', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '2 xonali', exact: true }).click();
  await expect(page).toHaveURL(/\/rentals\?rooms=2/);
  await expect(page.getByRole('heading', { name: "Ijara e'lonlari" })).toBeVisible();

  // Cards rendered from the server with the rooms filter active.
  const cards = page.locator('a[href^="/property/"]');
  await expect(cards.first()).toBeVisible();

  // Open the filter drawer, set a max price, apply.
  await page.getByRole('button', { name: /Filtrlar/ }).click();
  await page.getByLabel(/Narx \(UZS\) \(gacha\)/).fill('10000000');
  await page.getByRole('button', { name: "Qo'llash" }).click();

  // The URL is the source of truth: rooms preserved, maxPrice added (§63).
  await expect(page).toHaveURL(/rooms=2/);
  await expect(page).toHaveURL(/maxPrice=10000000/);
  await expect(cards.first()).toBeVisible();
});
