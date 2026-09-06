import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hash } from 'argon2';
import 'dotenv/config';

// Seed: reference data (locations, fx) + first admin from env.
// Idempotent — safe to re-run. See context/1_Phase.md §1.2.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Uzbekistan's 14 regions with slug + center coordinates. */
const REGIONS = [
  { name: "Toshkent shahri", slug: "tashkent-city", lat: 41.3111, lng: 69.2797, districts: ["Yunusobod", "Chilonzor", "Mirzo Ulug'bek", "Sergeli", "Olmazor", "Shayxontohur", "Yakkasaroy", "Bektemir", "Mirobod", "Uchtepa"] },
  { name: "Toshkent viloyati", slug: "tashkent-region", lat: 41.0, lng: 69.5, districts: ["Chirchiq", "Angren", "Olmaliq", "Zangiota", "Qibray"] },
  { name: "Samarqand viloyati", slug: "samarkand", lat: 39.6542, lng: 66.9597, districts: ["Registon", "Samarqand markazi", "Urgut", "Kattaqo'rg'on", "Jomboy"] },
  { name: "Buxoro viloyati", slug: "bukhara", lat: 39.7681, lng: 64.4556, districts: ["Buxoro markazi", "Kogon", "G'ijduvon", "Vobkent"] },
  { name: "Andijon viloyati", slug: "andijan", lat: 40.7821, lng: 72.3442, districts: ["Andijon markazi", "Asaka", "Xonobod", "Shahrixon"] },
  { name: "Farg'ona viloyati", slug: "fergana", lat: 40.3864, lng: 71.7864, districts: ["Farg'ona markazi", "Qo'qon", "Marg'ilon", "Quvasoy"] },
  { name: "Namangan viloyati", slug: "namangan", lat: 40.9983, lng: 71.6726, districts: ["Namangan markazi", "Chust", "Pop", "Uchqo'rg'on"] },
  { name: "Qashqadaryo viloyati", slug: "kashkadarya", lat: 38.8611, lng: 65.7847, districts: ["Qarshi", "Shahrisabz", "Kitob", "G'uzor"] },
  { name: "Surxondaryo viloyati", slug: "surkhandarya", lat: 37.2242, lng: 67.2783, districts: ["Termiz", "Denov", "Boysun", "Sherobod"] },
  { name: "Jizzax viloyati", slug: "jizzakh", lat: 40.1158, lng: 67.8422, districts: ["Jizzax markazi", "G'allaorol", "Zomin", "Do'stlik"] },
  { name: "Sirdaryo viloyati", slug: "sirdarya", lat: 40.8439, lng: 68.7189, districts: ["Guliston", "Yangiyer", "Shirin", "Boyovut"] },
  { name: "Navoiy viloyati", slug: "navoiy", lat: 40.0844, lng: 65.3792, districts: ["Navoiy markazi", "Zarafshon", "Nurota", "Karmana"] },
  { name: "Xorazm viloyati", slug: "khorezm", lat: 41.55, lng: 60.6333, districts: ["Urganch", "Xiva", "Shovot", "Gurlan"] },
  { name: "Qoraqalpog'iston Respublikasi", slug: "karakalpakstan", lat: 42.4531, lng: 59.6103, districts: ["Nukus", "Xo'jayli", "Chimboy", "To'rtko'l"] },
] as const;

async function seedLocations(): Promise<void> {
  for (const region of REGIONS) {
    const parent = await prisma.locations.upsert({
      where: { slug: region.slug },
      update: { name: region.name },
      create: { name: region.name, slug: region.slug, kind: 'REGION' },
    });
    for (const district of region.districts) {
      const slug = `${region.slug}-${district
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')}`;
      await prisma.locations.upsert({
        where: { slug },
        update: { name: district },
        create: { name: district, slug, kind: 'DISTRICT', parentId: parent.id },
      });
    }
  }
  console.log(`locations: ${REGIONS.length} regions seeded`);
}

async function seedFx(): Promise<void> {
  const today = new Date();
  const asOf = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  await prisma.fxRates.upsert({
    where: { base_quote_asOf: { base: 'USD', quote: 'UZS', asOf } },
    update: {},
    create: {
      base: 'USD',
      quote: 'UZS',
      rate: 12650, // placeholder seed rate; the daily CBU job replaces it (Phase 2)
      asOf,
      source: 'seed',
    },
  });
  console.log('fx_rates: USD→UZS seeded for today');
}

async function seedAdmin(): Promise<void> {
  const phone = process.env.ADMIN_PHONE ?? '+998901234567';
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password) {
    console.log('admin: ADMIN_INITIAL_PASSWORD not set — skipping');
    return;
  }
  const passwordHash = await hash(password);
  const admin = await prisma.users.upsert({
    where: { phone },
    update: { role: 'ADMIN', isPhoneVerified: true, canListProperties: true },
    create: {
      name: 'RentUZ Admin',
      phone,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      isPhoneVerified: true,
      canListProperties: true,
    },
  });
  console.log(`admin: seeded ${admin.phone}`);
}

async function main(): Promise<void> {
  await seedLocations();
  await seedFx();
  await seedAdmin();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
