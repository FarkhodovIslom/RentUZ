import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { loginBrowser, provisionProperty, provisionUser } from './helpers';

/**
 * Phase 5 E2E (5_Phase.md §3) — two browser contexts: tenant + owner over a
 * provisioned property. Covers: Xabarlash entry point, realtime delivery both
 * directions, read receipts, typing indicator, image attachment via signed
 * URL, and presence-offline after the grace window (PRESENCE_GRACE_MS=2000
 * in the webServer env).
 */

test.describe('chat flow — tenant ↔ owner (§27)', () => {
  // Realtime waits (typing indicator, attachment upload + signed URL, presence
  // grace) legitimately exceed the 30 s default.
  test.setTimeout(120_000);
  test('full conversation lifecycle in real time', async ({ browser }) => {
    const { slug, owner } = await provisionProperty();
    const tenant = await provisionUser();

    const tenantContext = await browser.newContext();
    const ownerContext = await browser.newContext();
    const tenantPage = await tenantContext.newPage();
    const ownerPage = await ownerContext.newPage();

    try {
      // ── Tenant opens the property page and clicks "Xabarlash".
      await loginBrowser(tenantPage, tenant);
      await tenantPage.goto(`/property/${slug}`);
      await tenantPage.getByRole('button', { name: 'Xabarlash' }).first().click();

      // Routed into the chat surface with the conversation preselected.
      await expect(tenantPage).toHaveURL(/\/chat\?c=/);

      // ── Owner logs in on a second browser and sees the conversation appear.
      await loginBrowser(ownerPage, owner);
      await ownerPage.goto('/chat');
      const ownerConvRow = ownerPage.locator('section ul li', { hasText: 'E2E Tester' }).first();
      await expect(ownerConvRow).toBeVisible({ timeout: 15_000 });

      // ── Tenant sends a message; the owner receives it in real time.
      const tenantComposer = tenantPage.getByPlaceholder('Xabar yozing...');
      await tenantComposer.fill('Salom! Kvartira hali ijarada mi?');
      await tenantComposer.press('Enter');
      await ownerConvRow.locator('button').first().click();
      // The text appears in the list preview AND the bubble — target the bubble.
      await expect(
        ownerPage.getByText('Salom! Kvartira hali ijarada mi?').last(),
      ).toBeVisible({ timeout: 15_000 });

      // ── Owner opened the conversation (auto-read) → tenant sees "O'qilgan".
      await expect(tenantPage.getByText("O'qilgan").first()).toBeVisible({ timeout: 15_000 });

      // ── Owner types — tenant sees the typing indicator (typing:update).
      const ownerComposer = ownerPage.getByPlaceholder('Xabar yozing...');
      await ownerComposer.fill('Ha, bo');
      await expect(tenantPage.getByLabel('Yozmoqda...')).toBeVisible({ timeout: 15_000 });

      // ── Owner replies; the tenant receives it in real time.
      await ownerComposer.fill("Ha, bo'sh. Keling kelasi haftada ko'ramiz.");
      await ownerComposer.press('Enter');
      await expect(
        tenantPage.getByText("Ha, bo'sh. Keling kelasi haftada ko'ramiz.").last(),
      ).toBeVisible({ timeout: 15_000 });

      // ── Tenant uploads an image; the owner sees it render via the signed URL.
      const chooser = tenantPage.waitForEvent('filechooser');
      await tenantPage.getByTitle(/Rasm qo.shish/).click();
      const fileChooser = await chooser;
      // 200×200 fixture (server min dimensions are 100×100).
      const fixture = await readFile('e2e/fixtures/chat-200x200.png');
      await fileChooser.setFiles({
        name: 'chat-200x200.png',
        mimeType: 'image/png',
        buffer: fixture,
      });
      // The upload lands as a pill (above the composer form) — wait for it,
      // then send the attachment-only message (Yuborish enables on upload).
      const pill = tenantPage.locator('span', { hasText: 'Rasm qo' }).filter({ hasText: '×' }).first();
      await expect(pill).toBeVisible({ timeout: 15_000 });
      await tenantPage.getByRole('button', { name: 'Yuborish' }).click();
      await expect(
        ownerPage.getByAltText('Chatdagi rasm').first(),
      ).toBeVisible({ timeout: 20_000 });

      // ── Owner closes their browser → tenant sees the online dot go gray.
      await ownerContext.close();
      await expect(
        tenantPage.getByLabel(/Offlayn/).first(),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await tenantContext.close().catch(() => undefined);
      await ownerContext.close().catch(() => undefined);
    }
  });
});
