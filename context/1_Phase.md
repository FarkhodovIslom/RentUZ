# RentUZ MVP — Phase 1: Schema, Auth, RBAC, Users, BFF

> Cross-cutting decisions live in `0_Phase.md`. This file only adds the database layer, auth flow, RBAC primitives, users module, and the web side that they unlock (BFF + auth pages + protected routes).

## Goal
Define the MVP data model, ship auth (phone-first, register/login/refresh/logout/verify-phone/forgot/reset), the RBAC core, the `users` module, and the BFF proxy + auth pages that connect them. Public/property features (search, listings) come in Phase 3 — this phase produces a logged-in shell that the next phases build on.

## Scope (spec coverage)
§11 (roles), §23–§24 (auth), §35 (schema), §36 (user status), §38–§40 (API base + auth + users), §52 (indexes), §53 (security), §98 (rate limits), §90 (ownership). Schema and auth tokens are settled here; later phases add only module-specific tables and routes.

## Out of scope this phase
Phone provider integration (Eskiz/Play Mobile — pre-launch), password complexity policy (use NIST-style 12+ chars; banlist via haveibeenpwned API optional), email verification, Google/Apple OAuth. `reviews`, `subscriptions`, `payments` tables are **not** created.

---

## 1. Tasks (ordered, with paths)

### 1.1 Database migrations
1. `apps/api/prisma/schema.prisma` — define datasource + generator (per `0_Phase.md` §6) and the full set of MVP models listed in §2 below. Validate with `pnpm prisma validate`.
2. `apps/api/prisma/migrations/20260101000000_init_extensions/migration.sql` (first migration, hand-written so the shadow DB gets PostGIS too):
   ```sql
   CREATE SCHEMA IF NOT EXISTS extensions;
   CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   ```
3. `pnpm prisma migrate dev` to generate client + apply. Verify: `SELECT postgis_version();` in db, and the generated client imports in `apps/api/src/prisma/prisma.service.ts`.
4. Post-migration raw SQL (also in the init migration or a follow-up):
   ```sql
   CREATE INDEX properties_location_gix ON properties USING GIST (location);
   CREATE UNIQUE INDEX rental_requests_pending_uniq
     ON rental_requests ("tenantId","propertyId") WHERE status = 'PENDING';
   ```
   These are added with `prisma migrate` not in `schema.prisma` because Prisma's expression-form partial unique index coverage is limited across all supported versions.

### 1.2 Seeding (minimal, just for auth/users)
5. `apps/api/prisma/seed.ts` — 14 regions + at least the 4 most-searched cities' districts into `locations`; the rate (1 USD = X UZS) into `fx_rates` for "today"; first admin user from `ADMIN_PHONE` / `ADMIN_INITIAL_PASSWORD` (Argon2id hash). Run via `pnpm db:seed`.
6. Verify: log in with the seeded admin phone, see `role: ADMIN` in `/users/me`.

### 1.3 API — common
7. `apps/api/src/common/guards/jwt-auth.guard.ts` — `@Public()` metadata bypass, otherwise validates `Authorization: Bearer` OR the `rentuz_at` cookie (set by BFF). Attaches `req.user`.
8. `apps/api/src/common/guards/role.guard.ts` + `@Roles(...)` decorator — 403 on mismatch.
9. `apps/api/src/common/guards/suspended.guard.ts` — short-circuits suspended users to 403 `INSUFFICIENT_PERMISSIONS` for mutating endpoints.
10. `apps/api/src/common/guards/throttle.guard.ts` — Redis-backed guard over `rate-limiter-flexible` (replaces `@nestjs/throttler`, see `0_Phase.md` §1 trap #2). Reads `@Throttle({ key, points, duration, blockDuration? })` metadata.
11. `apps/api/src/common/decorators/roles.decorator.ts`, `public.decorator.ts`, `throttle.decorator.ts`, `current-user.decorator.ts`.
12. `apps/api/src/common/services/password.service.ts` — Argon2id with sensible cost params; `hash()` and `verify()`.
13. `apps/api/src/common/services/jwt.service.ts` — issue/verify access tokens; separate sign/verify for socket tickets (different audience).

### 1.4 API — auth module
14. `apps/api/src/modules/auth/auth.module.ts`, `auth.controller.ts`, `auth.service.ts`, `dto/*.ts` (Zod schemas live in `packages/contracts` and re-imported).
15. **Register** `POST /auth/register`: validate (phone E.164, password, name, email optional) → throttle → create `users` row with `role: USER`, `status: ACTIVE`, `isPhoneVerified: false`, hashed password → issue OTP (`phone_verifications`), send via `SmsSender` (console driver in dev returns code) → on success issue access+refresh, set cookies, respond `{ user, accessToken, refreshToken, otpSent: true }` (or omit `otpSent` in prod).
16. **Login** `POST /auth/login`: throttle (`login` policy, per IP+phone, 5/min; account-level lockout after 10 fails/15 min via a Redis counter on `auth:fail:<phone>`) → verify password → on success issue tokens + clear fail counter → set cookies. Phone-only for MVP; email/password login not exposed.
17. **Refresh** `POST /auth/refresh`: read `rentuz_rt` cookie → look up hashed refresh token in DB → if found and not revoked: rotate (insert new, mark old `revokedAt`), set new cookies, respond with new access+refresh → if the old token is **already revoked**, treat as reuse → revoke the entire token family and respond 401 `UNAUTHORIZED`. This is the §53 spec for token rotation.
18. **Logout** `POST /auth/logout`: revoke current refresh token (mark `revokedAt`); clear cookies.
19. **Phone verify** `POST /auth/verify-phone`: validate code (hashed compare, attempts++, TTL check) → on success mark `users.isPhoneVerified=true`, set `canListProperties=true` (the spec's "owner must be verified" gate, §54), delete OTP row, issue new tokens with updated claims, drop `phone_verifications` row.
20. **Resend OTP** `POST /auth/phone/resend` (rate-limited) — reissue code, invalidates prior.
21. **Forgot password** `POST /auth/forgot-password`: throttle → upsert OTP with `purpose: RESET` → respond 200 always (no user enumeration). SMS side effect identical to verify-phone.
22. **Reset password** `POST /auth/reset-password`: validate code + new password → update `passwordHash` → revoke **all** refresh tokens for that user (force re-login on every device).
23. All endpoints use the global envelope interceptor; on success return `data: { user, accessToken, refreshToken, otpSent? }`. Login/register/OTP/forgot/reset responses **never echo the OTP in prod** (guard at controller).

### 1.5 API — users module
24. `apps/api/src/modules/users/users.module.ts`, `users.controller.ts`, `users.service.ts`, `dto/*.ts`.
25. `GET /users/me` — return current user (id, name, phone, email, avatar, role, isPhoneVerified, canListProperties, status, createdAt). Never return `passwordHash`.
26. `PATCH /users/me` — partial update of name/email (email format + uniqueness).
27. ~~`PATCH /users/me/avatar`~~ — **deferred to Phase 2** (user decision, 2026-09-06): the storage abstraction + sharp pipeline is built once with property images; avatar reuses it. `users.avatar` column exists from day one and stays null.

### 1.6 Web — BFF proxy
28. `apps/web/src/app/api/v1/[...path]/route.ts` — implements all methods. Steps: read `Cookie` from incoming request → fetch `INTERNAL_API_URL/<path>` with same method/body/headers (forwards `cookie`, `content-type`, `accept`, `accept-language`, `x-forwarded-for`) → copy response headers, **strip `set-cookie`'s `Domain=` attribute** and ensure `Path=/`, `SameSite=Lax`, `Secure` in prod → return to the browser. For multipart: stream the body without re-parsing.
29. `apps/web/src/lib/api.ts` — typed fetch wrapper used by client components + RSC server actions. Always calls relative `/api/v1/...`; never absolute URLs in the browser.
30. `apps/web/src/lib/session.ts` — server-side helpers `getSession()` (reads `rentuz_at` via `cookies()` from `next/headers`, calls API `/users/me`, returns null on 401), `requireSession()` (throws/redirects).

### 1.7 Web — auth pages
31. `apps/web/src/app/(auth)/layout.tsx` — minimal centered layout, dark theme.
32. `apps/web/src/app/(auth)/login/page.tsx` — phone + password form (RHF + Zod resolver from `packages/contracts`), error handling, lockout messaging, link to register/forgot.
33. `apps/web/src/app/(auth)/register/page.tsx` — phone, name, password, optional email; on success routes to `/auth/verify-phone`.
34. `apps/web/src/app/(auth)/verify-phone/page.tsx` — 5-digit input (paste support), 60 s resend button, redirects to `/` on success.
35. `apps/web/src/app/(auth)/forgot-password/page.tsx`, `reset-password/page.tsx` — corresponding forms.
36. State transitions: verification banner persists in `(app)/layout.tsx` until `isPhoneVerified` becomes true (a server component reads it once per nav via `getSession()`).

### 1.8 Web — route protection
37. `apps/web/src/app/(tenant)/layout.tsx`, `(owner)/layout.tsx`, `(admin)/layout.tsx` — `requireSession()` + role check (admin for `/admin`, owner-capability for `/owner`); redirect to `/login` or `/forbidden` as appropriate.
38. `apps/web/src/app/forbidden/page.tsx` — uses the global error state UI (`EmptyState` from `packages/ui`).

### 1.9 i18n keys (only the ones this phase ships)
`messages/uz.json`: `auth.login.title`, `auth.login.cta`, `auth.register.title`, `auth.verifyPhone.title`, `auth.verifyPhone.resend`, `errors.unauthorized`, `errors.forbidden`, `errors.locked`, `common.loading`, `common.retry`, `nav.profile`, `nav.logout`, `verification.banner.title`, `verification.banner.cta`. All other keys land with their pages in later phases.

---

## 2. Database changes (this phase only)

The full schema below is **the entire MVP schema** (later phases add no new tables; only indexes and partial columns).

```prisma
// apps/api/prisma/schema.prisma (essentials)
// Prisma 7 (Phase 0 outcome): NO url/directUrl inside the schema. The CLI
// reads DATABASE_DIRECT_URL from prisma.config.ts; the app runtime connects
// through @prisma/adapter-pg with DATABASE_URL (see 0_Phase.md §1 trap 5).

datasource db {
  provider = "postgresql"
}

generator client {
  provider            = "prisma-client"
  output              = "./src/generated/prisma"
  runtime             = "nodejs"
  moduleFormat        = "esm"
  importFileExtension = "js"
}

enum UserRole       { USER ADMIN }
enum UserStatus     { ACTIVE SUSPENDED DELETED }
enum Currency       { UZS USD }
enum PropertyType   { APARTMENT HOUSE ROOM COMMERCIAL OFFICE LAND OTHER }
enum PropertyStatus { DRAFT PENDING_VERIFICATION ACTIVE PAUSED RENTED REJECTED DELETED }
enum FurnishedLevel { NONE PARTIAL FULL }
enum RentalStatus   { PENDING ACCEPTED REJECTED CANCELLED EXPIRED COMPLETED }
enum NotifType      { REQUEST_ACCEPTED REQUEST_REJECTED NEW_MESSAGE PROPERTY_VERIFIED PROPERTY_REJECTED PRICE_CHANGED SAVED_SEARCH_MATCH PREMIUM_PAYMENT_STATUS }
enum ReportStatus   { OPEN REVIEWING RESOLVED REJECTED }
enum ReportTarget   { USER PROPERTY MESSAGE REVIEW }
enum ReportPriority { LOW MEDIUM HIGH CRITICAL }
enum OtpPurpose     { REGISTRATION LOGIN RESET }

model users {
  id                String   @id @default(uuid()) @db.Uuid
  name              String   @db.VarChar(80)
  email             String?  @unique @db.Citext
  phone             String   @unique @db.VarChar(20)  // E.164, validated
  passwordHash      String   @db.VarChar(255)
  avatar            String?  @db.Text
  role              UserRole @default(USER)
  status            UserStatus @default(ACTIVE)
  isPhoneVerified   Boolean  @default(false)
  canListProperties Boolean  @default(false)
  lastSeenAt        DateTime? @db.Timestamptz(6)
  createdAt         DateTime @default(now()) @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt      @db.Timestamptz(6)

  properties        properties[]      @relation("user_properties")
  refreshTokens     refreshTokens[]
  phoneVerifications phoneVerifications[]
  favorites         favorites[]
  rentalRequestsAsTenant rentalRequests[] @relation("rr_tenant")
  rentalRequestsAsOwner  rentalRequests[] @relation("rr_owner")
  conversationsAsTenant  conversations[]  @relation("conv_tenant")
  conversationsAsOwner   conversations[]  @relation("conv_owner")
  conversationParticipants conversationParticipants[]
  messages          messages[]
  notifications     notifications[]
  reportsFiled      reports[]          @relation("reporter")
  reportsResolved   reports[]          @relation("resolver")
  views             propertyViews[]
  auditLogs         auditLogs[]
  region            locations? @relation(fields: [regionId], references: [id])
  regionId          String?    @db.Uuid

  @@index([role, status, createdAt])
}

model refreshTokens {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  user        users    @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash   String   @db.VarChar(128)   // SHA-256 hex
  family      String   @db.Uuid
  parentId    String?  @db.Uuid
  userAgent   String?  @db.Text
  ip          String?  @db.Inet
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  expiresAt   DateTime @db.Timestamptz(6)
  revokedAt   DateTime? @db.Timestamptz(6)

  @@index([userId, revokedAt])
  @@index([family])
  @@unique([userId, tokenHash])
}

model phoneVerifications {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String?  @db.Uuid          // nullable for pre-registration flow
  user        users?   @relation(fields: [userId], references: [id], onDelete: Cascade)
  phone       String   @db.VarChar(20)
  purpose     OtpPurpose
  codeHash    String   @db.VarChar(128)
  attempts    Int      @default(0)
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  expiresAt   DateTime @db.Timestamptz(6)
  consumedAt  DateTime? @db.Timestamptz(6)

  @@index([phone, purpose, createdAt])
}

model locations {                       // self-referential: regions + districts
  id        String   @id @default(uuid()) @db.Uuid
  parentId  String?  @db.Uuid
  parent    locations? @relation("loc_parent", fields: [parentId], references: [id])
  children  locations[] @relation("loc_parent")
  kind      String   @db.VarChar(16)   // "REGION" | "DISTRICT" | "CITY"
  name      String   @db.VarChar(120)
  slug      String   @unique @db.VarChar(140)

  properties properties[]

  @@index([parentId])
}

model fxRates {
  id        String   @id @default(uuid()) @db.Uuid
  base      Currency
  quote     Currency
  rate      Decimal  @db.Decimal(20,8)
  asOf      DateTime @db.Date
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  source    String   @db.VarChar(40)

  @@unique([base, quote, asOf])
  @@index([quote, asOf])
}

// --- properties + related models (declared here, behaviors land in Phase 2/3) ---

model properties {
  id              String         @id @default(uuid()) @db.Uuid
  ownerId         String         @db.Uuid
  owner           users          @relation("user_properties", fields: [ownerId], references: [id])
  title           String         @db.VarChar(160)
  slug            String         @unique @db.VarChar(200)   // for /property/[slug]
  description     String         @db.Text
  type            PropertyType
  price           Decimal        @db.Decimal(14,2)
  currency        Currency       @default(UZS)
  priceUzs        BigInt         // normalized for filter/sort
  period          String         @db.VarChar(16)            // "month" only for MVP
  rooms           Int
  bedrooms        Int
  bathrooms       Int
  area            Decimal        @db.Decimal(8,2)
  floor           Int?
  totalFloors     Int?
  renovation      String?        @db.VarChar(40)
  furnished       FurnishedLevel @default(NONE)
  petsAllowed     Boolean        @default(false)
  smokingAllowed  Boolean        @default(false)
  address         String         @db.VarChar(255)
  location        Unsupported("geography(Point, 4326)")?
  lat             Float?
  lng             Float?
  regionId        String?        @db.Uuid
  districtId      String?        @db.Uuid
  region          locations?     @relation(fields: [regionId], references: [id])
  amenities       Json           @db.JsonB
  status          PropertyStatus @default(DRAFT)
  isVerified      Boolean        @default(false)
  verifiedAt      DateTime?      @db.Timestamptz(6)
  verifiedBy      String?        @db.Uuid
  rejectionReason String?        @db.Text
  submittedAt     DateTime?      @db.Timestamptz(6)
  views           Int            @default(0)
  mainImageUrl    String?        @db.Text
  createdAt       DateTime       @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime       @updatedAt      @db.Timestamptz(6)

  images          propertyImages[]
  favorites       favorites[]
  rentalRequests  rentalRequests[]
  conversations   conversations[]
  viewsLog        propertyViews[]
  dailyStats      propertyDailyStats[]

  @@index([status, type, priceUzs, createdAt])
  @@index([ownerId, status])
  @@index([regionId, districtId])
  // GiST index on location is created in the init migration (see §1.1 task 4)
}

model propertyImages {
  id         String   @id @default(uuid()) @db.Uuid
  propertyId String   @db.Uuid
  property   properties @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  url        String   @db.Text
  thumbUrl   String?  @db.Text
  width      Int
  height     Int
  ordering   Int      @default(0)
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  @@index([propertyId, ordering])
}

model favorites {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @db.Uuid
  propertyId String   @db.Uuid
  user       users      @relation(fields: [userId], references: [id], onDelete: Cascade)
  property   properties @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  @@unique([userId, propertyId])
  @@index([userId, createdAt])
}

model rentalRequests {
  id              String        @id @default(uuid()) @db.Uuid
  tenantId        String        @db.Uuid
  ownerId         String        @db.Uuid
  propertyId      String        @db.Uuid
  message         String        @db.Text
  startDate       DateTime      @db.Date
  durationMonths  Int           // 1..36
  priceSnapshot   Decimal       @db.Decimal(14,2)
  currency        Currency
  priceUzsSnapshot BigInt
  status          RentalStatus  @default(PENDING)
  decidedAt       DateTime?     @db.Timestamptz(6)
  decidedBy       String?       @db.Uuid
  decisionNote    String?       @db.Text
  createdAt       DateTime      @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime      @updatedAt      @db.Timestamptz(6)

  tenant          users        @relation("rr_tenant", fields: [tenantId], references: [id])
  owner           users        @relation("rr_owner",  fields: [ownerId],  references: [id])
  property        properties   @relation(fields: [propertyId], references: [id])

  @@index([tenantId, status, createdAt])
  @@index([ownerId,  status, createdAt])
  @@index([propertyId, status])
  // partial unique index is added in the init migration
}

model conversations {
  id                String   @id @default(uuid()) @db.Uuid
  propertyId        String?  @db.Uuid
  tenantId          String   @db.Uuid
  ownerId           String   @db.Uuid
  lastMessageAt     DateTime? @db.Timestamptz(6)
  lastMessagePreview String? @db.VarChar(200)
  createdAt         DateTime @default(now()) @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt      @db.Timestamptz(6)

  property          properties? @relation(fields: [propertyId], references: [id])
  tenant            users @relation("conv_tenant", fields: [tenantId], references: [id])
  owner             users @relation("conv_owner",  fields: [ownerId],  references: [id])
  participants      conversationParticipants[]
  messages          messages[]

  @@unique([propertyId, tenantId, ownerId])
  @@index([tenantId, lastMessageAt])
  @@index([ownerId,  lastMessageAt])
}

model conversationParticipants {
  id              String   @id @default(uuid()) @db.Uuid
  conversationId  String   @db.Uuid
  userId          String   @db.Uuid
  lastReadAt      DateTime? @db.Timestamptz(6)
  joinedAt        DateTime @default(now()) @db.Timestamptz(6)
  conversation    conversations @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user            users    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([conversationId, userId])
}

model messages {
  id              String   @id @default(uuid()) @db.Uuid
  conversationId  String   @db.Uuid
  senderId        String   @db.Uuid
  text            String   @db.Text
  attachments     Json     @db.JsonB  // [{ key, mime, width, height, size }]
  createdAt       DateTime @default(now()) @db.Timestamptz(6)

  conversation    conversations @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender          users    @relation(fields: [senderId], references: [id])
  @@index([conversationId, createdAt])
}

model notifications {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  type      NotifType
  titleKey  String   @db.VarChar(80)  // i18n key
  bodyKey   String   @db.VarChar(80)
  data      Json     @db.JsonB
  readAt    DateTime? @db.Timestamptz(6)
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  user      users    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt])
  @@index([userId, readAt])
}

model reports {
  id          String   @id @default(uuid()) @db.Uuid
  reporterId  String   @db.Uuid
  targetType  ReportTarget
  targetId    String   @db.Uuid
  reason      String   @db.VarChar(60)
  description String?  @db.Text
  priority    ReportPriority @default(MEDIUM)
  status      ReportStatus   @default(OPEN)
  evidence    Json     @db.JsonB
  resolvedBy  String?  @db.Uuid
  resolvedAt  DateTime? @db.Timestamptz(6)
  resolutionNote String? @db.Text
  createdAt   DateTime @default(now()) @db.Timestamptz(6)

  reporter    users  @relation("reporter", fields: [reporterId], references: [id])
  resolver    users? @relation("resolver", fields: [resolvedBy], references: [id])
  @@index([status, priority, createdAt])
  @@index([targetType, targetId])
}

model propertyViews {
  id          String   @id @default(uuid()) @db.Uuid
  propertyId  String   @db.Uuid
  userId      String?  @db.Uuid
  sessionId   String   @db.VarChar(64)
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  property    properties @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  user        users?     @relation(fields: [userId], references: [id])
  @@index([propertyId, createdAt])
  @@index([propertyId, sessionId, createdAt])
}

model propertyDailyStats {
  id          String   @id @default(uuid()) @db.Uuid
  propertyId  String   @db.Uuid
  day         DateTime @db.Date
  views       Int      @default(0)
  favorites   Int      @default(0)
  messages    Int      @default(0)
  requests    Int      @default(0)
  property    properties @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  @@unique([propertyId, day])
}

model auditLogs {
  id          String   @id @default(uuid()) @db.Uuid
  adminId     String   @db.Uuid
  admin       users    @relation(fields: [adminId], references: [id])
  action      String   @db.VarChar(60)   // USER_SUSPENDED, PROPERTY_APPROVED, ...
  targetType  String   @db.VarChar(30)
  targetId    String   @db.Uuid
  metadata    Json     @db.JsonB
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  @@index([adminId, createdAt])
  @@index([action, createdAt])
}

// Phase 2 product tables (payments, subscriptions) are intentionally NOT part
// of the MVP schema — see 0_Phase.md "Out of MVP scope". They are created by a
// Phase 2 migration when the premium/payments work starts.
```

**Spec deviations, explicit (§35 vs this phase)**:
- Added tables not in §35: `refreshTokens`, `phoneVerifications`, `locations`, `fxRates`, `propertyDailyStats`, `auditLogs` — required for the flows the spec actually describes (token rotation, OTP, location filter, currency, analytics, admin audit).
- Replaced ambiguous `users.isVerified` with `isPhoneVerified` (spec §60 conflates phone verification and property verification — they are different flows, so they live in different fields/tables).
- Removed `reviews` (Phase 2) and `subscription.payment` columns not in spec.
- `messages.readBy` jsonb → `conversationParticipants.lastReadAt` (cleaner, scales).
- `conversations.lastMessageId` FK removed; `lastMessageAt` + `lastMessagePreview` denormalized (no circular FK, faster list query).
- `properties.location` is Prisma `Unsupported`; all geo is raw SQL in one repository.
- `amenities` is `Json` per §35, not a join table (spec says "filter via boolean columns furnished/pets/smoking" — those are real columns, `amenities` is just a display list).

---

## 3. API contracts (Zod, in `packages/contracts`)

```ts
// auth.ts
export const LoginInput    = z.object({ phone: z.string().regex(/^\+998\d{9}$/), password: z.string().min(12).max(128) });
export const RegisterInput = LoginInput.extend({ name: z.string().min(2).max(80), email: z.string().email().optional() });
export const VerifyPhoneInput = z.object({ phone: z.string().regex(/^\+998\d{9}$/), code: z.string().regex(/^\d{5}$/), purpose: z.enum(["REGISTRATION","RESET"]) });
export const ResetPasswordInput = z.object({ phone: z.string().regex(/^\+998\d{9}$/), code: z.string().regex(/^\d{5}$/), newPassword: z.string().min(12).max(128) });

// users.ts
export const UpdateMeInput = z.object({ name: z.string().min(2).max(80).optional(), email: z.string().email().nullable().optional() });
```

Cookie names: `rentuz_at` (access JWT, 15 min), `rentuz_rt` (refresh opaque, 30 d). Both `Path=/`, `SameSite=Lax`, `Secure` when `NODE_ENV=production`, no `Domain` (BFF strips any the API sets).

---

## 4. Tests (definition of done per §100)

Unit:
- Password service hash/verify
- JWT service sign/verify, audience separation
- Refresh token rotation + **reuse detection** (presented revoked → family revoked)
- OTP service: attempts limit, expiry, single-use
- Throttle guard: counter behavior, env-driven policies

Integration (real PostGIS + Redis from compose):
- Register → verify → login → refresh (token rotates, old can't be reused) → logout
- Login lockout after 10 fails / 15 min (Redis key observable)
- Forgot → reset → all existing refresh tokens revoked
- Suspended user is 403 on any mutating endpoint, can still `GET /users/me`
- `/users/me` never returns `passwordHash`
- `@Public()` works (e.g., `GET /ready`)

Security:
- RBAC bypass: regular user calling admin route → 403
- Auth bypass: missing token → 401; tampered token → 401
- Suspicious: an unauthenticated user cannot register without throttle kicking in (10 calls/min)
- Ownership: a user trying to PATCH another user's `/users/me` is impossible (it's `/me`); but a smoke test ensures the param route is `/users/me` and not `/users/:id`

E2E (Playwright): register → land on `/auth/verify-phone` → enter dev OTP → land on `/` as a verified user.

---

## 5. Risks & escape hatches

- **PostGIS shadow-DB mismatch** → first migration includes the extension; same `extensions` schema in dev and prod; covered in `0_Phase.md`.
- **Token rotation + reuse** complexity → keep logic in one service (`refresh.service.ts`), covered by unit + integration tests above.
- **OTP SMS in prod** → `AUTH_OTP_DEV_MODE=true` only in dev; production startup assert logs a warning if `SMS_PROVIDER=console`. Real provider is pre-launch.
- **Citext extension** for `users.email` lowercasing — added to the init migration alongside PostGIS.
- **N+1 in `/users/me` `?expand=stats`** (not in this phase) — deferred to Phase 6.

---

## 6. Phase 1 outcomes (implemented 2026-09-06)

**Status: COMPLETE — all DoD gates green.** Deviations and verified facts:

1. **Ports**: local db moved to **5434** (5432/5433 taken by other projects on this machine) — compose, `.env.example`, `env.ts` defaults, `prisma.config.ts` all consistent. Prisma 7 CLI does not load `.env` — `prisma.config.ts` does `import 'dotenv/config'`.
2. **Migrations**: `20260906112211_auth_core` — 17 tables + enums; starts with `SET search_path = public, extensions;` (the migration connection does not inherit the URL search_path); appends raw-SQL GiST index on `location` + partial unique `(tenantId, propertyId) WHERE status='PENDING'` on `"rentalRequests"` (Prisma names tables camelCase — raw SQL must match). Verified: PostGIS in `extensions` schema, both custom indexes present.
3. **Seed**: 14 regions + 64 districts (78 locations), USD→UZS rate for today, admin user from `ADMIN_PHONE`/`ADMIN_INITIAL_PASSWORD` (Argon2id). Idempotent upserts.
4. **Auth module** (`apps/api/src/modules/auth/`): register / login (+ Redis fail-counter lockout: 10 fails/15 min → 429) / refresh (rotation + **reuse detection → family revoke**, verified) / logout / verify-phone (5-attempt, 5-min TTL, hashed codes → `isPhoneVerified` + `canListProperties`) / phone/resend / forgot-password (no enumeration) / reset-password (revokes ALL tokens, then issues one fresh session token). `SmsSender` interface + console driver; dev OTP returned only when `AUTH_OTP_DEV_MODE && !production`.
5. **RBAC stack**: `ThrottleGuard` (Redis, `@Throttle` decorator, `DISABLE_THROTTLE=true` for tests) → `JwtAuthGuard` (Bearer or `rentuz_at` cookie, `@Public()` bypass) → `SuspendedGuard` (403 on mutations) → `RoleGuard` (`@Roles`). **Decorator order rule**: `@Controller()` before `@Public()` (trap 6).
6. **Users module**: `GET/PATCH /users/me` only — avatar moved to Phase 2 (user decision).
7. **Env**: production assertions throw on dev secrets (`<32 chars`), `AUTH_OTP_DEV_MODE=true`, `AUTO_APPROVE_LISTINGS=true`; warns on `SMS_PROVIDER=console`. Covered by unit tests.
8. **Web**: BFF proxy `app/api/v1/[...path]/route.ts` (cookie pass-through, `Domain=` stripped from Set-Cookie, multipart-safe body forward); `lib/api.ts` (typed fetch, `ApiError`); `lib/session.ts` (`getSession`/`requireSession`); 5 auth pages (RHF 7.87 + Zod resolvers 5.9.1): login, register, verify-phone (60 s resend cooldown), forgot, reset; `(tenant)/layout.tsx` with verification banner; favorites placeholder; `@/*` path alias; uz.json auth/verification/favorites keys.
9. **Tests**: 13 api unit + 7 contracts unit + **11 integration** (supertest vs live PostGIS/Redis; truncation between cases; mirrors `main.ts` setup — cookieParser + validation pipe + prefix, trap 13). Full curl smoke of register→verify→login→refresh-rotate→reuse-revoke→users/me(401/200/passwordHash-absent) also verified manually.
10. **OpenAPI**: `/docs` serves Swagger with 5 auth DTO schemas registered via **native `z.toJSONSchema()`** (trap 1 resolution) — `zod-openapi` was removed (v6 API incompatible: no `extendsZodWithOpenApi`, registry required).
11. **E2E (Playwright)**: deferred — CI Lighthouse/E2E wiring lands with Phase 3 per plan; integration suite covers the Phase 1 DoD.
12. **nestjs-pino**: still deferred (Nest `Logger` in use) — Phase 8 monitoring item.

**Verification (AGENTS.md order)**: lint ✓ · typecheck ✓ · unit 20/20 ✓ · integration 11/11 ✓ · build ✓ (web pre-renders 12 routes; api `dist/` via `scripts/build.mjs`) · boot `/health` 200, `/ready` 200 (db+redis ok).
