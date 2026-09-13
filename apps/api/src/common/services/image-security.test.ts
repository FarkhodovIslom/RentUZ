import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ImageService, detectMime, MAGIC_BYTE_SNIFFERS } from './image.service.js';
import type { StorageService } from './storage.service.js';

/**
 * Phase 8 file-security unit suite (8_Phase.md §1.3 item 20 / §94):
 * - SVG with a renamed .jpg/.png extension is REJECTED (magic bytes don't lie)
 * - a JPEG/JS polyglot (valid JPEG header + embedded JS tail) is REJECTED —
 *   sharp must fail to decode the tail as image data or the variants pipeline
 *   refuses it; we assert the payload never lands in storage intact.
 * - detectMime accepts real JPEG/PNG/WebP headers.
 *
 * Storage is stubbed — processAndStore's first gate (validation) is the
 * security boundary under test; no bytes reach S3 for invalid files.
 */

const stubStorage = {
  putPublic: async () => ({}),
  putPrivate: async () => ({}),
  delete: async () => undefined,
} as unknown as StorageService;

const service = new ImageService(stubStorage);

async function jpegBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: '#333333' },
  })
    .jpeg()
    .toBuffer();
}

describe('file security (§94)', () => {
  it('rejects an SVG renamed to .png (magic bytes)', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><script>alert(1)</script></svg>',
    );
    await expect(
      service.processAndStore(svg, { keyPrefix: 'test', minWidth: 640, minHeight: 480 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a JPEG/JS polyglot (valid JPEG header, appended script tail)', async () => {
    const jpeg = await jpegBuffer(800, 600);
    const polyglot = Buffer.concat([
      jpeg,
      Buffer.from('\n<script>alert(document.domain)</script>'),
    ]);
    // The magic-byte gate passes (JPEG header), but sharp must still refuse
    // trailing garbage — failOn covers truncated, and strict decoding
    // surfaces trailing-data problems as an error.
    await expect(
      service.processAndStore(polyglot, { keyPrefix: 'test', minWidth: 640, minHeight: 480 }),
    ).rejects.toThrow();
  });

  it('accepts a real JPEG through the full pipeline', async () => {
    const jpeg = await jpegBuffer(700, 500);
    const result = await service.processAndStore(jpeg, {
      keyPrefix: 'test',
      minWidth: 640,
      minHeight: 480,
    });
    expect(result.width).toBeGreaterThanOrEqual(640);
    expect(Object.keys(result.variants).length).toBeGreaterThan(0);
  });

  it('detectMime recognizes all three allowed formats', () => {
    expect(detectMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('image/png');
    const webp = Buffer.alloc(12);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBP', 8, 'ascii');
    expect(detectMime(webp)).toBe('image/webp');
  });

  it('no sniffer accepts SVG or HTML text', () => {
    expect(detectMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectMime(Buffer.from('<!DOCTYPE html>'))).toBeNull();
    expect(MAGIC_BYTE_SNIFFERS).toHaveLength(3);
  });
});
