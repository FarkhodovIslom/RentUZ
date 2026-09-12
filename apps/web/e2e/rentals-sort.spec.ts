import { expect, test } from '@playwright/test';
import { parsePrice } from './helpers';

/**
 * §3 spec 2 — rentals → sort "Narxi arzon" → first card price ≤ second.
 */
test('sorting by price_asc orders cards ascending', async ({ page }) => {
  await page.goto('/rentals');

  const cards = page.locator('a[href^="/property/"]');
  await expect(cards.nth(1)).toBeVisible();

  await page.getByLabel('Saralash').selectOption('price_asc');
  await expect(page).toHaveURL(/sort=price_asc/);

  await expect
    .poll(async () => parsePrice(await page.locator('[data-testid="card-price"]').first().innerText()))
    .toBeGreaterThan(0);

  const prices: number[] = [];
  for (const el of await page.locator('[data-testid="card-price"]').all()) {
    prices.push(parsePrice(await el.innerText()));
  }
  expect(prices.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < prices.length; i++) {
    expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
  }
});
