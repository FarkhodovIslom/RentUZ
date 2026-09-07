import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { StorageService } from './storage.service.js';

export const MAGIC_BYTE_SNIFFERS: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF; WebP marker at offset 8
];

export interface ImageVariants {
  width: number;
  height: number;
  /** Map of variant name → { buffer, contentType, key } */
  variants: Record<string, { buffer: Buffer; contentType: string; key: string }>;
}

export interface ImageProcessingOptions {
  /** Logical key prefix (e.g. `properties/<propertyId>`). The image id is appended. */
  keyPrefix: string;
  /** Required minimum width × height. */
  minWidth: number;
  minHeight: number;
  /** Variant sizes to emit. Default: 400/800/1600. */
  variantWidths?: number[];
}

@Injectable()
export class ImageService {
  constructor(private readonly storage: StorageService) {}

  /**
   * Validate magic bytes, EXIF-strip, emit WebP variants, upload to the
   * public bucket, return their public keys + sizes.
   */
  async processAndStore(
    buffer: Buffer,
    options: ImageProcessingOptions,
  ): Promise<ImageVariants> {
    const detectedMime = detectMime(buffer);
    if (!detectedMime) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Fayl formati qo‘llab-quvvatlanmaydi (JPEG/PNG/WebP)' });
    }

    // .rotate() applies EXIF orientation; .withMetadata({ exif: {} }) drops it.
    const pipeline = sharp(buffer, { failOn: 'truncated' })
      .rotate()
      .withMetadata({ exif: {} });

    const meta = await pipeline.metadata();
    if ((meta.width ?? 0) < options.minWidth || (meta.height ?? 0) < options.minHeight) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Rasm o‘lchami juda kichik (min ${options.minWidth}×${options.minHeight})`,
      });
    }

    const widths = options.variantWidths ?? [400, 800, 1600];
    const imageId = cryptoRandomId();
    const variants: ImageVariants['variants'] = {};
    for (const w of widths) {
      const out = await sharp(buffer)
        .rotate()
        .withMetadata({ exif: {} })
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const key = `${options.keyPrefix}/${imageId}/${w}.webp`;
      await this.storage.putPublic(key, out, 'image/webp');
      variants[String(w)] = { buffer: out, contentType: 'image/webp', key };
    }
    return { width: meta.width ?? 0, height: meta.height ?? 0, variants };
  }
}

function detectMime(buffer: Buffer): string | null {
  for (const sniffer of MAGIC_BYTE_SNIFFERS) {
    if (buffer.length < sniffer.bytes.length) continue;
    let ok = true;
    for (let i = 0; i < sniffer.bytes.length; i++) {
      if (buffer[i] !== sniffer.bytes[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    // WebP: full magic is `RIFF????WEBP` — verify the WebP marker at offset 8.
    if (sniffer.mime === 'image/webp') {
      if (buffer.length < 12 || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
    }
    return sniffer.mime;
  }
  return null;
}

function cryptoRandomId(): string {
  return [...crypto.getRandomValues(new Uint8Array(12))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
