# Phase 8 Implementation Plan — SEO, A11y, Security, Performance, Monitoring, Deployment, DoD

## Context

- Fazalar 0–7 bajarilgan va `main`'da (oxirgi: Phase 7 admin/moderation, 2026-09-12). **Phase 8 — yagona bajarilmagan faza** (`context/8_Phase.md`).
- Kodda tekshirilgan mavjud holat: `sitemap.ts`/`robots.ts` minimal variantda mavjud; property sahifasida `generateMetadata` (qisqa) va UUID→slug redirect bor; `/health`+`/ready` va Helmet Phase 0'dan; `pausedReason` migratsiyasi Phase 7'da qilingan; Sentry o'rnatilmagan (faqat env placeholder); BFF'da CSRF yo'q; CSP/`proxy.ts` yo'q; CI minimal (lint/typecheck/test/build).
- **Ma'lum blockerlar**: `apps/api/prisma/seed.ts` `locations` jadvalini yaratmaydi (Phase-1 seed yo'qolgan — clean-checkout'da ishlamaydi); CI'da integration testlar umuman ishlamaydi.

## Resolved decisions (user-confirmed)

1. **Tashqi xizmatlar**: kod + konfig + runbook. Vercel/Render/Supabase projekt yaratish, `rentuz.uz` domeni, MapTiler kaliti, SMS provider, Sentry DSN — pre-launch checklist'da hujjatlashtiriladi, kod bilan bog'lanmaydi.
2. **CI**: to'liq kengaytirish — integration (PostGIS+Redis services), Playwright E2E, gitleaks, Lighthouse CI, deploy (Vercel/Render GitHub integrations orqali, CI yashil bo'lgach).
3. **Seed/CI blockerlar** Phase 8 doirasida tuzatiladi.

## Branch & workflow

`git checkout -b feature/phase-8-hardening` (main'dan). Har bir katta blok alohida commit. Yakunda PR + yashil CI.

---

## Task list (ordered)

### 0. Foundation blockers
1. **Seed fix**: `apps/api/prisma/seed.ts` — Phase-1 locations seedini (14 region + 64 district) seed.ts'ga qaytaring (idempotent upsert, `locations` bo'sh bo'lsa yaratadi). Clean checkout'da `db:migrate && db:seed` to'liq ishlashi kerak.
2. **Migration**: `properties_owner_active_idx` — `CREATE INDEX ... ON properties ("ownerId") WHERE status = 'ACTIVE';`. **Trap 18**: har yangi migratsiya PostGIS GiST indeksini qayta tushiradi — `SET search_path = public, extensions;` + `CREATE INDEX IF NOT EXISTS properties_location_gix ...` (trap 3 va 18, `20260912115350` misoliga qarang).

### 1. SEO
3. `robots.ts` — disallow'ga `/rental-requests`, `/notifications`, `/forbidden` qo'shing.
4. `sitemap.ts` — 50k yozuv chegarasi + sitemap index paginate (`sitemap-{n}.xml`); `NEXT_PUBLIC_SITE_URL`'ni `apps/web/.env.example`'ga qo'shing.
5. Property sahifasi `generateMetadata` to'liqlashtirish: `alternates.canonical`, `twitter` (summary_large_image), OG type; title format `${title} — ${rooms} xona, ${area} m², ${city} | RentUZ`.
6. JSON-LD `RealEstateListing` (narx, manzil, geo, rasmlar) — property details sahifasiga.
7. `generateStaticParams` (top 500 ACTIVE) + ISR fallback; property update'da `revalidatePath`/`revalidateTag` (API event → BFF orqali yoki route revalidate hook).
8. Auth/public sahifalar metadatasi: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/`, `/rentals`, `/map` — title, description, OG.
9. `apps/web/src/app/manifest.ts` + `icon.tsx`.

### 2. A11y
10. `@axe-core/playwright` + `apps/web/tests/a11y.spec.ts` + `test:a11y` scripti (web package.json + turbo.json). Sahifalar: `/`, `/rentals`, `/map`, `/property/<slug>`, `/login`, `/register`, `/404`, `/forbidden`, `/owner` (login holatda). `serious`/`critical` = fail.
11. Audit fixlar: root layout'da skip-to-content link; barcha ikonka-tugmalarga `aria-label`; forma xatolari `aria-describedby`; `globals.css`'da `:focus-visible`; `prefers-reduced-motion`; 44px touch target audit (`packages/ui` primitivlarida).
12. Kontrast hujjati: `apps/web/docs/a11y.md` (§3 sariq #080808/#121212 fonida — o'tadi).
13. Klaviatura testlari (Playwright): Tab/Shift+Tab/Enter/Space/Esc (modal), arrow keys.

### 3. Security
14. **CSRF**: API'da `GET /api/v1/csrf` (double-submit: HttpOnly cookie + JSON qiymat); BFF route (`apps/web/src/app/api/v1/[...path]/route.ts`) POST/PATCH/DELETE'da `x-rentuz-csrf` headerini tekshiradi; web fetch wrapper (`apps/web/src/lib/`) headerni qo'shadi. Integration test bilan.
15. **CSP nonce**: `apps/web/src/proxy.ts` (Next 16 — middleware emas) — har so'rovda nonce, `Content-Security-Policy` header (8_Phase.md §1.3.13 dagi politika; Sentry/map allowlist bilan).
16. **CI gitleaks** + `pnpm audit` (high = fail; `.secrets.baseline` kerak bo'lsa).
17. Testlar: login rate-limit (6-so'rov → 429); tampered JWT → 401; wrong-audience JWT (socket ticket secret bilan) → 401; SQL injection (`?city=' OR 1=1 --`); XSS (description'da `<script>` matn sifatida); SVG renamed-extension + JPEG/JS polyglot reject; public serializerning owner phone/email qaytarmasligi (contract test).
18. **Audit-coverage testi**: OpenAPI doc'dagi har bir mutating `/admin/...` route'da `@Audit` borligini tekshiradi (`pnpm test:audit-coverage`).

### 4. Performance
19. `next.config.ts`: `images.formats: ['image/webp']`, remotePatterns (Supabase + S3 hostlar); `<Image>` audit: above-the-fold `priority`, `sizes`.
20. Lazy import audit: map (`LazyMiniMap` bor — tekshirish), recharts, chat composer `dynamic(...)` bilan.
21. Bundle budget: 200 KB gzipped chegara — build'da tekshiruv (chunk size assert skripti, `turbo.json` build zanjiriga).
22. `EXPLAIN ANALYZE` snapshotlar (search, details, owner overview) → `apps/api/docs/perf.md`; full table scan yo'qligi.
23. Cache audit: Redis TTL'lar (popular cities, featured); `Cache-Control` — user-specific data `s-maxage`'da yo'qligi.
24. Pagination testi: hamma endpointda `limit ≤ 100` server-side enforce.
25. **Lighthouse CI**: 4 public sahifa; 3 run o'rtachasi; chegara: perf ≥85, a11y ≥95, bp ≥90, SEO ≥95 (local o'lchovdan −5).

### 5. Monitoring
26. **Sentry web**: `@sentry/nextjs` — `sentry.client.config.ts` + `sentry.server.config.ts`, DSN bo'lsa ishga tushadi, source maps build'da, sample 0.1 prod / 1.0 dev.
27. **Sentry API**: `@sentry/nestjs` `main.ts`'da (DSN-gated), PII scrub (`users.phone`, `users.email`, `passwordHash`, `refreshTokens.tokenHash`, `Authorization`), release = git SHA.
28. `/metrics` (prom-client): queue size, latency histogram, WS connections. `/ready` Render health path'ga ulangan (runbook'da).
29. Pino `LOG_TRANSPORT=production` transport konfigi.
30. Runbook: `apps/api/docs/operations.md` — alert chegaralari (error >2%, p95 >800ms, queue >1k/10min, disk >80%), log namunasi.

### 6. Deployment configs + CI
31. `apps/web/vercel.json`: security headerlar (HSTS preload, nosniff, Referrer-Policy, Permissions-Policy), region fra1 (dokumentatsiya).
32. Render konfig: `render.yaml` yoki runbook bo'limi (build `pnpm turbo build --filter=api...`, start `node dist/main.js`, health `/ready`, Starter tier).
33. Supabase runbook: pooled/direct URL'lar, bucket policylar, PITR, backup (§95).
34. **CI kengaytirish** (`.github/workflows/ci.yml`):
    - PR + push main: install → lint → typecheck → unit → **integration** (`postgis/postgis:17-3.5` + `redis:7` services; `DATABASE_DIRECT_URL`'ga migrate; seed) → build → **gitleaks** → **Lighthouse CI** → **Playwright E2E** (compose stack + seed; trap 15: integration'dan keyin qayta seed).
    - Push main + yashil CI: deploy (Vercel + Render GitHub integrations — auto-deploy, CI faqat gate).
35. DNS runbook bo'limi: `rentuz.uz`→Vercel, `api.`/`socket.`→Render, `www`→301.

### 7. Pre-launch code items
36. `apps/web/src/components/CookieBanner.tsx` (localStorage, funksional to'siq emas) + layout'ga ulash.
37. `/privacy` va `/terms` statik sahifalar (kontent placeholder — egasiga topshiriladi).

### 8. DoD audit + finalize
38. `apps/web/docs/dod.md` — §100'ning har bandi → dalil havolasi.
39. `apps/web/docs/ui-states.md` — sahifa-sahifa loading/empty/error/success.
40. **To'liq verification matrix** (AGENTS.md tartibida): `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm --filter api test:integration` → `pnpm --filter api db:seed` → `pnpm build` → `pnpm --filter web test:e2e` → `test:a11y`. Plus OWASP ZAP baseline + §79 pentest skript (staging URL bo'lsa; bo'lmasa lokal).
41. **Yakunlash**: `context/8_Phase.md` status reconciliation (allaqachon bajarilganlar: robots/sitemap mavjudligi, UUID redirect, /health+/ready, Helmet, pausedReason — belgilash); `walkthroughs/2026-09-XX-phase-8-hardening.md` (AGENTS.md completion record).

---

## Key traps (0_Phase.md — ushbu fazaga ta'sirli)

- **Trap 3/18**: yangi migratsiya `search_path=public,extensions` + GiST indeksni qayta qo'shishi shart.
- **Trap 12**: yangi DTO'larda (masalan CSRF) sana-schema ishlatilsa — faqat string.
- **Trap 13**: integration test app'lari `main.ts`'ni ko'chirishi shart (cookieParser + global pipe + prefix).
- **Trap 15**: integration testlar seedni o'chiradi → E2E'dan oldin qayta seed.
- **Trap 14**: `next lint` yo'q — ESLint to'g'ridan-to'g'ri.
- Prisma 7 pin: hech qachon bare `prisma` o'rnatilmaydi.

## Validation plan

Har blokdan keyin: `pnpm lint && pnpm typecheck && pnpm test`. Yakunda to'liq matrix (task 40) + yangi CI workflow'ning draft PR'da yashilishi. Migratsiya docker-compose stack'ga qarshi (`DATABASE_DIRECT_URL`, port 5434).

## Out of scope

- Real hisoblar/domen/pullik tier'lar (pre-launch checklist: SMS provider, MapTiler, domain, Sentry DSN, log aggregator, Supabase Pro) — runbook'da `8_Phase.md` §1.8 bo'yicha hujjatlashtiriladi.
- Yangi produkt feature'lar (premium, payments, reviews, push/email).
