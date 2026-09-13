import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { loginBrowser, provisionProperty, provisionUser, csrfHeaders } from './helpers';

/**
 * Phase 7 E2E (7_Phase.md §3): two admin contexts. The seeded admins
 * (ADMIN_PHONE / ADMIN2_PHONE from apps/api/.env) drive the verification and
 * moderation flows; a plain user verifies the /forbidden redirect.
 *
 * Requires `pnpm --filter api db:seed` first (trap 15 — integration suites
 * truncate the seed).
 */

function readApiEnv(): Record<string, string> {
  const path = fileURLToPath(new URL('../../api/.env', import.meta.url));
  const env: Record<string, string> = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) env[match[1]] = match[2];
    }
  } catch {
    // .env absent (CI) → environment variables are used instead.
  }
  return env;
}

const apiEnv = readApiEnv();
const ADMIN_PHONE = process.env.ADMIN_PHONE ?? apiEnv.ADMIN_PHONE ?? '+998901234567';
const ADMIN2_PHONE = process.env.ADMIN2_PHONE ?? apiEnv.ADMIN2_PHONE ?? '+998901234568';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD ?? apiEnv.ADMIN_INITIAL_PASSWORD ?? 'admin-phase1-test';

async function newAdminPage(
  browser: Browser,
  phone: string,
): Promise<{ page: Page; context: Awaited<ReturnType<Browser['newContext']>> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginBrowser(page, { phone, password: ADMIN_PASSWORD });
  return { page, context };
}

/** Flip a runtime flag through the BFF using the page's admin session. */
async function setFlag(page: Page, body: Record<string, boolean>): Promise<void> {
  const csrf = await csrfHeaders(page.request);
  const res = await page.request.patch('/api/v1/admin/flags', { headers: csrf, data: body });
  expect(res.ok()).toBeTruthy();
}

test.describe('Phase 7 admin moderation', () => {
  test('admin 1 claims 2, approves 1, rejects 1 → audit rows appear', async ({ browser }) => {
    const { page, context } = await newAdminPage(browser, ADMIN_PHONE);
    try {
      // AUTO_APPROVE off so submit lands in the verification queue.
      await setFlag(page, { AUTO_APPROVE_LISTINGS: false });
      let first: { id: string; slug: string };
      let second: { id: string; slug: string };
      try {
        first = await provisionProperty();
        second = await provisionProperty();
      } finally {
        await setFlag(page, { AUTO_APPROVE_LISTINGS: true });
      }

      await page.goto('/admin/verification');
      await page.getByTestId(`verification-row-${first.id}`).click();
      await expect(page.getByTestId('verification-review')).toBeVisible();
      await page.getByRole('button', { name: /olish/i }).click();

      // Reject the first listing with a mandatory reason.
      await page.getByTestId('verification-reject').click();
      await page.getByTestId('confirm-reason').fill('rasmlar juda past sifatli');
      await page.getByTestId('confirm-submit').click();
      await expect(page.getByTestId('confirm-modal')).toBeHidden();

      // Approve the second after confirming the 5-point checklist.
      await page.getByTestId(`verification-row-${second.id}`).click();
      await expect(page.getByTestId('verification-review')).toBeVisible();
      for (const key of ['locationMatches', 'priceInRange', 'imagesClear', 'ownerVerifiable', 'noDuplicates']) {
        await page.getByTestId(`checklist-${key}`).check();
      }
      await page.getByTestId('verification-approve').click();

      // Both audit rows land in the settings audit tab.
      await page.goto('/admin/settings');
      await page.getByTestId('settings-tab-audit').click();
      await expect(page.getByTestId('audit-row-PROPERTY_APPROVED').first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('audit-row-PROPERTY_REJECTED').first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('admin 2 escalates a HIGH report to CRITICAL', async ({ browser }) => {
    const property = await provisionProperty();
    const reporter = await provisionUser();

    // File a HIGH-priority report (SCAM auto-derives HIGH) as a regular user.
    const reporterContext = await browser.newContext();
    const reporterPage = await reporterContext.newPage();
    await loginBrowser(reporterPage, reporter);
    const created = await reporterPage.request.post('/api/v1/reports', {
      headers: await csrfHeaders(reporterPage.request),
      data: { targetType: 'PROPERTY', targetId: property.id, reason: 'SCAM' },
    });
    expect(created.ok()).toBeTruthy();
    const reportId = ((await created.json()) as { data: { id: string } }).data.id;
    await reporterContext.close();

    const { page, context } = await newAdminPage(browser, ADMIN2_PHONE);
    try {
      await page.goto('/admin/reports');
      await page.locator('[data-testid^="report-row-"]').first().click();
      await expect(page.getByTestId('report-review')).toBeVisible();
      await page.getByTestId('report-escalate').click();
      // The list re-fetches; the escalated report's priority chip turns CRITICAL.
      await expect(page.getByTestId(`priority-${reportId}`)).toHaveText('Kritik', { timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('non-admin visiting /admin is redirected to /forbidden', async ({ browser }) => {
    const user = await provisionUser();
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginBrowser(page, user);
      await page.goto('/admin');
      await expect(page).toHaveURL(/\/forbidden/);
    } finally {
      await context.close();
    }
  });
});
