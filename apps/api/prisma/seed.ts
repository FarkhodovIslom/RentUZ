/**
 * RentUZ Phase 2 seed — 8 owners, 20 tenants, 120 properties with sharp-generated
 * placeholder images uploaded to MinIO. Deterministic via `seedrandom`.
 * Idempotent: if the admin phone already exists, the rest of the script
 * still runs upserts keyed by phone/slug.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { hash as argonHash } from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import 'dotenv/config';
import seedrandom from 'seedrandom';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5434/rentuz?schema=public&search_path=public,extensions';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });

const s3 = new S3Client({
  endpoint: process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? 'minioadmin',
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? 'minioadmin',
  },
});
const PUBLIC_BUCKET = process.env.STORAGE_BUCKET_PUBLIC ?? 'rentuz-public';
const PUBLIC_BASE = process.env.PUBLIC_STORAGE_BASE_URL ?? 'http://localhost:9000/rentuz-public';

const rng = seedrandom('rentuz-mvp-2026');

async function placeholderImage(seed: number, _label: string): Promise<Buffer> {
  const hue = (seed * 47) % 360;
  const bg = `hsl(${hue}, 50%, 22%)`;
  const fg = `hsl(${(hue + 30) % 360}, 70%, 70%)`;
  return sharp({
    create: { width: 1280, height: 960, channels: 3, background: bg },
  })
    .composite([{ input: Buffer.from(`<svg><rect width="1280" height="960" fill="${fg}" opacity="0.15"/></svg>`) }])
    .png()
    .toBuffer();
}

async function uploadToMinio(key: string, body: Buffer, _contentType: string): Promise<string> {
  await s3.send(new PutObjectCommand({ Bucket: PUBLIC_BUCKET, Key: key, Body: body, ContentType }));
  return `${PUBLIC_BASE}/${key}`;
}

const REGIONS = [
  { slug: 'tashkent-city', weight: 0.6 },
  { slug: 'samarkand', weight: 0.15 },
  { slug: 'bukhara', weight: 0.1 },
  { slug: 'tashkent-region', weight: 0.05 },
  { slug: 'andijan', weight: 0.05 },
  { slug: 'fergana', weight: 0.025 },
  { slug: 'namangan', weight: 0.025 },
] as const;

const TYPES = ['APARTMENT', 'HOUSE', 'ROOM', 'COMMERCIAL', 'OFFICE'] as const;
const FURNISHED = ['NONE', 'PARTIAL', 'FULL'] as const;
const AMENITIES = ['wifi', 'parking', 'furniture', 'ac', 'tv', 'fridge', 'washer', 'elevator'];
const STATUS_DIST = { ACTIVE: 80, PENDING_VERIFICATION: 15, DRAFT: 5, PAUSED: 5, RENTED: 5, REJECTED: 2 } as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function weighted<T extends string>(map: Record<T, number>): T {
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [k, v] of Object.entries(map) as [T, number][]) {
    if (r < v) return k;
    r -= v;
  }
  return 'ACTIVE';
}

function pickRegionSlug(): string {
  const total = REGIONS.reduce((a, r) => a + r.weight, 0);
  let r = rng() * total;
  for (const region of REGIONS) {
    if (r < region.weight) return region.slug;
    r -= region.weight;
  }
  return 'tashkent-city';
}

const TITLES = [
  'Yangi ta’mirlangan kvartira',
  'Metroga yaqin shinam uy',
  'Markazda 2 xonali kvartira',
  'Oila uchun qulay kvartira',
  'Talabalar uchun arzon xona',
  'Hashamatli 3 xonali kvartira',
  'Yangi bino, 1 xonali studiya',
  'Ofis maydoni, markazda',
  'Tijorat maydon, 1-qavat',
  'Hovlili 4 xonali uy',
  'Yashil hududda kvartira',
  'Premium-klass kvartira',
];

const ADDRESSES = [
  'Amir Temur 12-uy',
  'Mustaqillik 4-uy',
  'Bog‘ishamol 22-uy',
  'Buyuk Ipak Yo‘li 7',
  'Yangi Shahar 9-uy',
  'Yoshlik 5-tor',
  'Mehnat 11-uy',
  'Beruniy 8-uy',
  'Mirzo Ulug‘bek 14',
  'Sadriddin Ayniy 22',
  'Mirobod 6-tor',
  'Taraqqiyot 3-uy',
];

async function main(): Promise<void> {
  console.log('seed: starting');

  // 1. Admins (only if not exists). The second admin backs the Phase 7 E2E
  // "two admin contexts" spec — same ADMIN_INITIAL_PASSWORD.
  const adminPhone = process.env.ADMIN_PHONE ?? '+998901234567';
  const admin2Phone = process.env.ADMIN2_PHONE ?? '+998901234568';
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD ?? 'admin-phase1-test';
  const adminHash = await argonHash(adminPassword);
  const adminUpserts = [adminPhone, admin2Phone].map((phone) =>
    prisma.users.upsert({
      where: { phone },
      update: { role: 'ADMIN', isPhoneVerified: true, canListProperties: true },
      create: {
        name: 'RentUZ Admin',
        phone,
        passwordHash: adminHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        isPhoneVerified: true,
        canListProperties: true,
      },
    }),
  );
  await Promise.all(adminUpserts);
  console.log('  admins upserted');

  // 2. Owners (8).
  const ownerIds: string[] = [];
  for (let i = 0; i < 8; i++) {
    const phone = `+99890100000${i}`;
    const hash = await argonHash('paroltest12345');
    const owner = await prisma.users.upsert({
      where: { phone },
      update: { isPhoneVerified: true, canListProperties: true },
      create: {
        name: `Owner ${i + 1}`,
        phone,
        passwordHash: hash,
        role: 'USER',
        status: 'ACTIVE',
        isPhoneVerified: true,
        canListProperties: true,
      },
    });
    ownerIds.push(owner.id);
  }
  console.log(`  ${ownerIds.length} owners upserted`);

  // 3. Tenants (20).
  for (let i = 0; i < 20; i++) {
    const phone = `+9989020000${i.toString().padStart(2, '0')}`;
    const hash = await argonHash('paroltest12345');
    await prisma.users.upsert({
      where: { phone },
      update: {},
      create: {
        name: `Tenant ${i + 1}`,
        phone,
        passwordHash: hash,
        role: 'USER',
        status: 'ACTIVE',
        isPhoneVerified: i % 2 === 0,
        canListProperties: i % 2 === 0,
      },
    });
  }
  console.log('  20 tenants upserted');

  // 4. Cache regions.
  const regions = await prisma.locations.findMany({ where: { kind: 'REGION' } });
  if (regions.length === 0) {
    throw new Error('Run `pnpm db:seed` first (Phase 1 seed) to populate locations.');
  }
  const regionBySlug = new Map(regions.map((r) => [r.slug, r]));
  const districtsByParent = new Map<string, Awaited<ReturnType<typeof prisma.locations.findMany>>>();
  for (const r of regions) {
    const ds = await prisma.locations.findMany({ where: { parentId: r.id } });
    districtsByParent.set(r.id, ds);
  }

  // 5. Skip if properties already exist (idempotent).
  const existing = await prisma.properties.count();
  if (existing >= 120) {
    console.log(`  ${existing} properties already exist — skipping`);
    return;
  }

  // 6. FX rate (1 USD = 12650 UZS for today, fallback).
  const today = new Date();
  const asOf = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  await prisma.fxRates.upsert({
    where: { base_quote_asOf: { base: 'USD', quote: 'UZS', asOf } },
    update: {},
    create: { base: 'USD', quote: 'UZS', rate: 12650, asOf, source: 'seed' },
  });

  // 7. 120 properties with sharp placeholder images.
  let count = 0;
  for (let i = 0; i < 120; i++) {
    const ownerId = ownerIds[i % ownerIds.length]!;
    const regionSlug = pickRegionSlug();
    const region = regionBySlug.get(regionSlug)!;
    const districts = districtsByParent.get(region.id) ?? [];
    const district = districts[Math.floor(rng() * districts.length)] ?? null;

    const status = weighted(STATUS_DIST) as
      | 'ACTIVE'
      | 'PENDING_VERIFICATION'
      | 'DRAFT'
      | 'PAUSED'
      | 'RENTED'
      | 'REJECTED';
    const type = pick(TYPES);
    const furnished = pick(FURNISHED);
    const rooms = 1 + Math.floor(rng() * 4);
    const bedrooms = Math.min(rooms, 1 + Math.floor(rng() * (rooms + 1)));
    const bathrooms = 1 + Math.floor(rng() * 2);
    const area = 30 + Math.floor(rng() * 130);
    const priceUzsBig = 2_000_000 + Math.floor(rng() * 13_000_000);
    const currency: 'UZS' | 'USD' = rng() < 0.05 ? 'USD' : 'UZS';
    const title = `${pick(TITLES)} №${i + 1}`;
    const address = `${pick(ADDRESSES)}`;
    const amenities = AMENITIES.filter(() => rng() < 0.4).slice(0, 4);
    const isVerified = status === 'ACTIVE' && rng() < 0.6;

    // Upload 3 placeholder images for ACTIVE properties (others get none to save time).
    const imageCount = status === 'ACTIVE' ? 3 + Math.floor(rng() * 3) : 0;
    const imageIds: { id: string; key: string }[] = [];
    let mainImageUrl: string | null = null;

    for (let j = 0; j < imageCount; j++) {
      try {
        const buf = await placeholderImage(i * 10 + j, `p${i}-${j}`);
        const id = randomUUID();
        const key = `properties/seed-${i}/${id}/${['400', '800', '1600'][j % 3]}.webp`;
        const url = await uploadToMinio(key, buf, 'image/webp').catch(() => `${PUBLIC_BASE}/${key}`);
        imageIds.push({ id, key: url });
        if (j === 0) mainImageUrl = url;
      } catch {
        // Storage offline: skip silently — properties still get created.
      }
    }

    const slug = `seed-${i}-${randomBytes(3).toString('hex')}`;

    await prisma.properties.create({
      data: {
        ownerId,
        slug,
        title,
        description: `Yangi ta'mirlangan ${rooms} xonali ${type === 'APARTMENT' ? 'kvartira' : 'mulk'}, ${area} m², ${address}. Hujjatlar to'liq rasmiylashtirilgan.`,
        type,
        price: String(priceUzsBig),
        priceUzs: BigInt(priceUzsBig),
        currency,
        period: 'month',
        rooms,
        bedrooms,
        bathrooms,
        area: String(area),
        floor: 1 + Math.floor(rng() * 12),
        totalFloors: 3 + Math.floor(rng() * 12),
        renovation: 'good',
        furnished,
        petsAllowed: rng() < 0.3,
        smokingAllowed: rng() < 0.3,
        address,
        regionId: region.id,
        districtId: district?.id ?? null,
        lat: 39 + rng() * 4,
        lng: 64 + rng() * 8,
        amenities,
        status,
        isVerified,
        verifiedAt: isVerified ? new Date() : null,
        views: Math.floor(rng() * 100),
        mainImageUrl,
        submittedAt: status !== 'DRAFT' ? new Date() : null,
        images: {
          create: imageIds.map((img, j) => ({
            id: img.id,
            url: img.key,
            thumbUrl: img.key,
            width: 1280,
            height: 960,
            ordering: j,
          })),
        },
      },
    });
    count++;
  }
  console.log(`  ${count} properties created`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
