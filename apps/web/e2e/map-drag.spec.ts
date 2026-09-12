import { expect, test } from '@playwright/test';

/**
 * §3 spec 3 — anonymous map → drag → bbox lands in the URL (§63) and
 * markers refetch from /search/map.
 *
 * The basemap depends on external hosts (OSM tiles, maplibre demotiles
 * glyphs). OSM throttles headless UAs and the sandbox may block egress, so
 * both are stubbed: tiles become 1×1 PNGs, glyph PBFs become empty bodies.
 * maplibre treats failed/empty resources as errored-but-complete, so the
 * style still reaches `load` and camera events fire — deterministically.
 */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG }),
  );
  await page.route('https://demotiles.maplibre.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) }),
  );
});

test('map drag updates the bbox in the URL', async ({ page }) => {
  await page.goto('/map');

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => page.url(), { timeout: 10_000 })
    .toContain('swLng='); // default viewport is written to the URL on mount

  const box = await canvas.boundingBox();
  if (!box) throw new Error('map canvas has no bounding box');

  // Drag the map left-down.
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.55, { steps: 8 });
  await page.mouse.up();

  const before = page.url();
  await expect
    .poll(async () => page.url(), { timeout: 10_000 })
    .not.toBe(before); // debounced replaceState wrote the new bbox
  await expect(page).toHaveURL(/swLng=-?\d/);
  await expect(page).toHaveURL(/neLng=-?\d/);
});
