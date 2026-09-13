import { test, expect } from '@playwright/test';
import { provisionUser, csrfHeaders } from './helpers';

/**
 * Phase 8 security E2E (8_Phase.md §1.3 item 19): a property description
 * containing <script> must render as TEXT on the details page — no script
 * execution, no dangerouslySetInnerHTML outside the escaped JSON-LD block.
 *
 * The listing is created through the real API surface (draft → patch with the
 * payload → submit with AUTO_APPROVE on), so the payload passes Zod
 * validation + storage exactly as a hostile owner would submit it.
 */
test('XSS: script tags in description render as text', async ({ page }) => {
  const owner = await provisionUser();
  const csrf = await csrfHeaders(page.request);

  const login = await page.request.post('/api/v1/auth/login', {
    headers: csrf,
    data: { phone: owner.phone, password: owner.password },
  });
  expect(login.ok()).toBe(true);
  const token = (await login.json()).data.accessToken as string;
  const auth = { Authorization: `Bearer ${token}`, ...csrf };

  const locations = await page.request.get('/api/v1/public/locations');
  const regionId = (
    (await locations.json()).data as Array<{ id: string; kind: string }>
  ).find((l) => l.kind === 'REGION')!.id;

  const draft = await page.request.post('/api/v1/properties', { headers: auth });
  expect(draft.ok()).toBe(true);
  const propertyId = (await draft.json()).data.id as string;

  const payload = '<script>alert(1)</script><img src=x onerror=alert(2)> XSS sinovi';
  const patch = await page.request.patch(`/api/v1/properties/${propertyId}`, {
    headers: auth,
    data: {
      title: 'XSS sinov e’loni — Toshkent',
      description: `Xavfsizlik sinovi. ${payload} matn sifatida ko‘rinishi kerak.`,
      type: 'APARTMENT',
      price: 7_000_000,
      rooms: 2,
      bedrooms: 1,
      bathrooms: 1,
      area: 55,
      address: 'XSS ko‘chasi 1',
      regionId,
      amenities: ['wifi'],
    },
  });
  expect(patch.ok(), await patch.text()).toBe(true);

  const submit = await page.request.post(`/api/v1/properties/${propertyId}/submit`, { headers: auth });
  expect(submit.ok()).toBe(true);

  const detailApi = await page.request.get(`/api/v1/public/properties/${propertyId}`);
  const slug = ((await detailApi.json()).data as { slug: string }).slug;

  // A real execution would surface as a dialog — count them (must stay 0).
  let dialogCount = 0;
  page.on('dialog', (dialog) => {
    dialogCount++;
    void dialog.dismiss();
  });

  await page.goto(`/property/${slug}`);

  // The payload appears literally in the page body as text.
  await expect(page.getByText('<script>alert(1)</script>', { exact: false })).toBeVisible();

  // No dialog ever fired: React escaped the payload — nothing executed.
  await page.waitForTimeout(500);
  expect(dialogCount).toBe(0);

  // And the rendered description node is a text paragraph, not an element
  // injection: the payload string is inside a <p>, never a live <script>.
  const liveScript = await page.evaluate(() => {
    const p = Array.from(document.querySelectorAll('p')).find((el) =>
      el.textContent?.includes('alert(1)'),
    );
    return p ? p.querySelector('script,img') !== null : false;
  });
  expect(liveScript).toBe(false);
});
