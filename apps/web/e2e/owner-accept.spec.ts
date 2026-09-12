import { expect, test } from '@playwright/test';
import { provisionUser, loginBrowser, provisionProperty, submitRequest } from './helpers';

/**
 * §3 — owner accepts a pending request; the row flips to Qabul qilingan and
 * the property leaves the public /rentals search (status RENTED).
 */
test('owner accepts a request and the property leaves search', async ({ page }) => {
  const { slug, id, owner } = await provisionProperty();

  // Tenant submits via the API (the browser flow is covered by its own spec).
  const tenant = await provisionUser();
  const login = await page.request.post('/api/v1/auth/login', {
    data: { phone: tenant.phone, password: tenant.password },
  });
  const tenantToken = (await login.json()).data.accessToken as string;
  await submitRequest(tenantToken, id);

  await loginBrowser(page, owner);
  await page.goto('/owner/requests?status=PENDING');
  await expect(page.getByText('E2E Ijara uyi — Toshkent markazi')).toBeVisible();

  page.on('dialog', (dialog) => dialog.accept()); // the "cannot be undone" confirm
  await page.getByRole('button', { name: 'Qabul qilish' }).click();

  // Toast fires immediately; the row state lands after the soft refresh.
  await expect(page.getByRole('status').first()).toContainText('qabul qilindi', { timeout: 15_000 });
  await page.goto('/owner/requests?status=ACCEPTED', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Qabul qilingan').first()).toBeVisible();

  // The property is RENTED — its card no longer appears in the public grid.
  // (Match the exact slug — earlier runs can leave same-titled E2E leftovers.)
  await page.goto('/rentals', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(`a[href="/property/${slug}"]`)).toHaveCount(0);
});
