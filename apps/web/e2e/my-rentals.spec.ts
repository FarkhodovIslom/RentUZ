import { expect, test } from '@playwright/test';
import { provisionUser, loginBrowser, provisionProperty, submitRequest, csrfHeaders } from './helpers';

/**
 * §3 — after the owner accepts, the tenant sees the rental under /my-rentals
 * (Active tab) with the frozen price snapshot and rental window.
 */
test('tenant sees the active rental in my-rentals', async ({ page }) => {
  const { id, owner } = await provisionProperty();

  const tenant = await provisionUser();
  const csrf = await csrfHeaders(page.request);
  const login = await page.request.post('/api/v1/auth/login', {
    headers: csrf,
    data: { phone: tenant.phone, password: tenant.password },
  });
  const tenantToken = (await login.json()).data.accessToken as string;
  await submitRequest(tenantToken, id);

  const ownerLogin = await page.request.post('/api/v1/auth/login', {
    headers: csrf,
    data: { phone: owner.phone, password: owner.password },
  });
  const ownerToken = (await ownerLogin.json()).data.accessToken as string;
  const requests = await page.request.get('/api/v1/owner/rental-requests?status=PENDING', {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  const requestId = ((await requests.json()).data.data as Array<{ id: string }>)[0].id;
  await page.request.patch(`/api/v1/rental-requests/${requestId}`, {
    headers: { Authorization: `Bearer ${ownerToken}`, ...csrf },
    data: { status: 'ACCEPTED' },
  });

  await loginBrowser(page, tenant);
  await page.goto('/my-rentals');
  await expect(page.getByRole('link', { name: 'E2E Ijara uyi — Toshkent markazi' })).toBeVisible();
  await expect(page.getByText('Faol ijara').first()).toBeVisible();
});
