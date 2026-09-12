import { request, type Page } from '@playwright/test';

/**
 * Shared helpers for the Phase 3 E2E specs (3_Phase.md §3). User provisioning
 * goes through the BFF with AUTH_OTP_DEV_MODE (OTP returned in the response).
 * `provisionUser` uses a DETACHED request context so the browser context
 * stays anonymous; `loginBrowser` logs in via page.request so its cookies
 * land in the browser cookie jar.
 */

export interface TestUser {
  phone: string;
  password: string;
}

export const TEST_PASSWORD = 'parole2etest123';

export function uniquePhone(): string {
  return `+998${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 10)}`.slice(0, 13);
}

/** Register + verify a user through the BFF; the browser stays anonymous. */
export async function provisionUser(): Promise<TestUser> {
  const user: TestUser = { phone: uniquePhone(), password: TEST_PASSWORD };
  const api = await request.newContext({ baseURL: 'http://localhost:3000' });
  try {
    const register = await api.post('/api/v1/auth/register', {
      data: { name: 'E2E Tester', phone: user.phone, password: user.password },
    });
    if (!register.ok()) throw new Error(`register failed: ${register.status()}`);
    const otp = ((await register.json()).data.otpDev as string) ?? '';
    await api.post('/api/v1/auth/verify-phone', {
      data: { phone: user.phone, code: otp, purpose: 'REGISTRATION' },
    });
  } finally {
    await api.dispose();
  }
  return user;
}

/** Log in through the BFF from the page context — cookies persist in the browser. */
export async function loginBrowser(page: Page, user: TestUser): Promise<void> {
  const response = await page.request.post('/api/v1/auth/login', {
    data: { phone: user.phone, password: user.password },
  });
  if (!response.ok()) throw new Error(`login failed: ${response.status()}`);
}

/** Any ACTIVE property slug from the search API. */
export async function firstActiveSlug(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/search/properties?limit=1');
  const body = await response.json();
  return body.data.data[0].slug as string;
}

/**
 * Phase 4 helper: registers an owner and provisions an ACTIVE property via
 * the API (draft → PATCH all FULL_VALIDATION_KEYS → submit; AUTO_APPROVE is
 * on in the E2E api env). Returns slug/id + the logged-in owner.
 */
export async function provisionProperty(): Promise<{
  slug: string;
  id: string;
  owner: TestUser;
  ownerToken: string;
}> {
  const owner = await provisionUser();
  const api = await request.newContext({ baseURL: 'http://localhost:3000' });
  try {
    const login = await api.post('/api/v1/auth/login', {
      data: { phone: owner.phone, password: owner.password },
    });
    if (!login.ok()) throw new Error(`owner login failed: ${login.status()}`);
    const token = (await login.json()).data.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    const locations = await api.get('/api/v1/public/locations', { headers: auth });
    const regionId = ((await locations.json()).data as Array<{ id: string; kind: string }>).find(
      (l) => l.kind === 'REGION',
    )?.id;

    const draft = await api.post('/api/v1/properties', { headers: auth });
    if (!draft.ok()) throw new Error(`draft failed: ${draft.status()}`);
    const property = (await draft.json()).data as { id: string };

    const patch = await api.patch(`/api/v1/properties/${property.id}`, {
      headers: auth,
      data: {
        title: 'E2E Ijara uyi — Toshkent markazi',
        description: 'E2E sinov uchun yaratilgan e\'lon. Hammasi joyida, toza va yorug\'.',
        type: 'APARTMENT',
        price: 7_500_000,
        rooms: 2,
        bedrooms: 1,
        bathrooms: 1,
        area: 55,
        address: 'E2E manzil 1',
        regionId,
        amenities: ['wifi'],
      },
    });
    if (!patch.ok()) throw new Error(`patch failed: ${patch.status()} ${await patch.text()}`);

    const submit = await api.post(`/api/v1/properties/${property.id}/submit`, { headers: auth });
    if (!submit.ok()) throw new Error(`submit failed: ${submit.status()}`);

    // The draft/submit responses carry no slug — read it back from the owner view.
    const detail = await api.get(`/api/v1/properties/${property.id}`, { headers: auth });
    if (!detail.ok()) throw new Error(`property read failed: ${detail.status()}`);
    const { slug } = (await detail.json()).data as { id: string; slug: string };

    return { slug, id: property.id, owner, ownerToken: token };
  } finally {
    await api.dispose();
  }
}

/** Submit a rental request via the API (tenant side, faster than the UI). */
export async function submitRequest(token: string, propertyId: string): Promise<{ id: string }> {
  const api = await request.newContext({ baseURL: 'http://localhost:3000' });
  try {
    const res = await api.post('/api/v1/rental-requests', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        propertyId,
        message: 'E2E: Bu uy ijaraga olishim mumkinmi? Sharhlaringizni kutaman.',
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        durationMonths: 12,
      },
    });
    if (!res.ok()) throw new Error(`request failed: ${res.status()}`);
    return (await res.json()).data as { id: string };
  } finally {
    await api.dispose();
  }
}

/** "1 234 567" → 1234567 (uz-UZ grouping is a non-breaking space). */
export function parsePrice(text: string): number {
  return Number(text.replace(/[^\d]/g, ''));
}
