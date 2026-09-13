import { expect, test } from '@playwright/test';
import { request as pwRequest } from '@playwright/test';
import { loginBrowser, provisionProperty, provisionUser, submitRequest, csrfHeaders } from './helpers';

/**
 * Phase 6 E2E: owner analytics renders live-aggregated data (custom range —
 * the rollup path is covered by the integration suite, since E2E boots with
 * DISABLE_JOBS) and switching range filters the chart without a reload.
 */
test('owner analytics: views + requests show up, insights render, range switch is client-side', async ({ page }) => {
  const { id, slug, owner, ownerToken } = await provisionProperty();

  // Two anonymous sessions visiting today == two propertyViews rows.
  for (let i = 0; i < 2; i++) {
    const ctx = await pwRequest.newContext({ baseURL: 'http://localhost:3000' });
    await ctx.get(`/api/v1/public/properties/${slug}`);
    await ctx.dispose();
  }

  // A pending + one accepted request today → live overview requests/conversion.
  const tenant = await provisionUser();
  const tApi = await pwRequest.newContext({ baseURL: 'http://localhost:3000' });
  const csrf = await csrfHeaders(tApi);
  const tenantLogin = await tApi.post('/api/v1/auth/login', {
    headers: csrf,
    data: { phone: tenant.phone, password: tenant.password },
  });
  const tenantToken = (await tenantLogin.json()).data.accessToken as string;
  const accepted = await submitRequest(tenantToken, id);
  await submitRequest(tenantToken, id).catch(() => undefined); // 2nd pending may conflict (dup rule)
  await tApi.patch(`/api/v1/rental-requests/${accepted.id}`, {
    headers: { Authorization: `Bearer ${ownerToken}`, ...csrf },
    data: { status: 'ACCEPTED' },
  });
  await tApi.dispose();

  await loginBrowser(page, owner);
  await page.goto('/owner/analytics', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('line-chart')).toBeVisible();

  // Default 30 d reads the (empty) rollup; switch to Custom today for the live path.
  await page.getByRole('button', { name: 'Maxsus oralik' }).click();
  const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill(today);
  await dateInputs.nth(1).fill(today);
  await page.getByRole('button', { name: "Qo'llash" }).click();

  await expect(page.getByTestId('analytics-kpis')).toContainText('2', { timeout: 10_000 });
  await expect(page.getByTestId('insights-panel')).toBeVisible();

  // Range switch stays on the client: URL unchanged, same chart element.
  const chart = page.getByTestId('line-chart');
  await chart.waitFor();
  await page.getByRole('button', { name: '7 kun' }).click();
  await expect(page).toHaveURL(/\/owner\/analytics/);
  await expect(chart).toBeVisible();
});
