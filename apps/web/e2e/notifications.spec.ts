import { expect, test } from '@playwright/test';
import { request as pwRequest } from '@playwright/test';
import { loginBrowser, provisionProperty, provisionUser, submitRequest, type TestUser } from './helpers';

/**
 * Phase 6 E2E (6_Phase.md §3): badge reacts to a lifecycle event, the bell
 * popover shows it, and /notifications groups it under "Bugun".
 */

async function loginTokenApi(user: TestUser): Promise<string> {
  const api = await pwRequest.newContext({ baseURL: 'http://localhost:3000' });
  try {
    const res = await api.post('/api/v1/auth/login', {
      data: { phone: user.phone, password: user.password },
    });
    return (await res.json()).data.accessToken as string;
  } finally {
    await api.dispose();
  }
}

test('tenant sees REQUEST_ACCEPTED badge → popover → Bugun section; mark-all clears it', async ({ page }) => {
  const { id, owner } = await provisionProperty();
  const tenant = await provisionUser();
  const tenantToken = await loginTokenApi(tenant);
  const req = await submitRequest(tenantToken, id);

  // Owner accepts via the API (owner-accept UI flow has its own spec).
  const api = await pwRequest.newContext({ baseURL: 'http://localhost:3000' });
  const accept = await api.patch(`/api/v1/rental-requests/${req.id}`, {
    headers: { Authorization: `Bearer ${(await loginTokenApi(owner))}` },
    data: { status: 'ACCEPTED' },
  });
  expect(accept.ok()).toBeTruthy();
  await api.dispose();

  await loginBrowser(page, tenant);
  await page.goto('/favorites', { waitUntil: 'domcontentloaded' });

  // Poll budget: badge must appear within ~30 s of the event (DoD) — the
  // first unread-count fetch happens on mount, so this is fast in practice.
  await expect(page.getByTestId('notification-badge')).toHaveText('1', { timeout: 10_000 });

  await page.getByTestId('notification-bell').click();
  const popover = page.getByTestId('notification-popover');
  await expect(popover).toBeVisible();
  await expect(popover.getByText("So'rov qabul qilindi")).toBeVisible();

  await popover.getByRole('link', { name: "Barchasini ko'rish" }).click();
  await expect(page).toHaveURL(/\/notifications/);
  await expect(page.getByTestId('section-bugun')).toContainText("So'rov qabul qilindi");

  await page.getByTestId('mark-all-read').click();
  await expect(page.getByTestId('notification-badge')).toHaveCount(0, { timeout: 10_000 });
});

test('owner price change → favoriting tenant sees PRICE_CHANGED (fan-out limit)', async ({ page }) => {
  const { id, owner } = await provisionProperty();
  const fan = await provisionUser();
  const outsider = await provisionUser();
  const fanToken = await loginTokenApi(fan);

  const api = await pwRequest.newContext({ baseURL: 'http://localhost:3000' });
  const fav = await api.post(`/api/v1/favorites/${id}`, {
    headers: { Authorization: `Bearer ${fanToken}` },
  });
  expect(fav.ok()).toBeTruthy();

  const priceRes = await api.patch(`/api/v1/properties/${id}/price`, {
    headers: { Authorization: `Bearer ${(await loginTokenApi(owner))}` },
    data: { price: 6_900_000, currency: 'UZS' },
  });
  expect(priceRes.ok()).toBeTruthy();
  await api.dispose();

  await loginBrowser(page, fan);
  await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('section-bugun')).toContainText("Narx o'zgardi", { timeout: 10_000 });
  await expect(page.getByTestId('section-bugun').first()).toContainText(/6\s?900\s?000/);

  // A non-favoriting user must see nothing.
  await loginBrowser(page, outsider);
  await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('notifications-empty')).toBeVisible();
});
