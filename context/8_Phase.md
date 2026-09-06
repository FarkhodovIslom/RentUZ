# RentUZ MVP — Phase 8: SEO, A11y, Security Hardening, Monitoring, Deployment, DoD

> Cross-cutting decisions live in `0_Phase.md`. This is the final hardening phase before launch: SEO pass on the public surface, accessibility sweep, security checklist, Sentry + monitoring, production deployment runbook, and a final audit against the §100 Definition of Done.

## Goal
RentUZ is production-ready: every public page is fast, accessible, indexed correctly, and visible to search engines; every security control from §53 is on; the API and web are both monitored; deploys are reproducible; the §100 DoD checklist passes line by line; and the documented risks/escape hatches from prior phases are reviewed with explicit status.

## Scope (spec coverage)
§7 (accessibility), §53 (security), §68 (performance), §69 (SEO), §71 (logging), §72 (monitoring), §75 (deployment), §77 (CI/CD), §78 (git workflow — final), §79 (testing — final), §92 (pagination — review), §94 (file security — review), §95 (database backup), §96 (scalability), §97 (caching), §98 (rate limits — review), §99 (privacy), §100 (definition of done).

## Out of scope
- Phase 2 product (premium, payments, reviews, push, email, AI, mobile) — those ship after MVP launch and are tracked in the `0_Phase.md` pre-launch items list
- New product features (no new endpoints, no new pages)

---

## 1. Tasks (ordered, with paths)

### 1.1 SEO (§69)
1. `apps/web/src/app/sitemap.ts` — dynamic sitemap of all ACTIVE properties, plus static pages. Returns 50k entries max per file; if more, paginates with a `sitemap-{n}.xml` index. Reads from `GET /search/properties?limit=100` paginated (admin can override limit=1000 in production).
2. `apps/web/src/app/robots.ts` — `User-agent: *`, `Allow: /`, `Disallow: /admin /owner /api /chat /favorites /rental-requests /my-rentals /notifications`, `Sitemap: <base>/sitemap.xml`.
3. `apps/web/src/app/(public)/property/[slug]/page.tsx` — dynamic `generateMetadata` per property:
   - `title`: `${title} — ${rooms} xona, ${area} m², ${city} | RentUZ`
   - `description`: first 160 chars of `description`
   - `alternates.canonical`: `${SITE_URL}/property/${slug}`
   - `openGraph`: title, description, image = first property image, type=product
   - `twitter`: card=summary_large_image
   - JSON-LD `RealEstateListing` (schema.org) with price, address, geo, images
4. `apps/web/src/app/(public)/property/[slug]/page.tsx` — add `generateStaticParams` for the top 500 ACTIVE properties (ISR fallback for the rest). Re-validate on `property.updated` event via `revalidatePath` and `revalidateTag`.
5. UUID → slug redirect: `apps/web/src/app/(public)/property/[slug]/page.tsx` checks if the param looks like a UUID; if so, looks up the slug and `redirect(..., 'replace')`. A new `GET /public/properties/lookup?ids=...` endpoint returns `{id, slug}[]` for the redirect path to use.
6. Page-level metadata for `/`, `/rentals`, `/map`, `/login`, `/register`, `/forgot-password`, `/reset-password` — all with localized titles, descriptions, OG images.
7. `apps/web/src/app/icon.tsx` (favicon), `apps/web/src/app/manifest.ts` (PWA-lite; full PWA is Phase 2 product).
8. Verify: `curl -s https://.../sitemap.xml | head`, `curl -sI https://.../property/<slug>` (status 200, has `link rel=canonical`), Lighthouse SEO ≥ 95.

### 1.2 Accessibility (§7)
9. Run `pnpm --filter web test:a11y` (Playwright + axe) against: `/`, `/rentals`, `/map`, `/property/<slug>`, `/login`, `/register`, `/forbidden`, `/404`, `/owner` (logged in). Fail the test on any `serious` or `critical` violation.
10. Audit + fix:
    - All images have `alt` (decorative → empty)
    - All form fields have associated labels; errors are linked via `aria-describedby`
    - All buttons have accessible names; icon-only buttons get `aria-label`
    - Visible focus ring on all interactive elements; the `FocusVisible` style lives in `globals.css`
    - Skip-to-content link in the root layout
    - `prefers-reduced-motion` respected in animations (modal enter, lightbox)
    - Color contrast ≥ 4.5:1 for body, 3:1 for large text; re-check §3 yellow on `#080808` (passes) and `#121212` (passes) — document in `apps/web/docs/a11y.md`
    - Touch targets ≥ 44×44 px — `packages/ui` primitives enforce this with a layout primitive
11. Keyboard test (Playwright): every interactive flow is operable by keyboard alone (Tab, Shift+Tab, Enter, Space, Esc to close modals, arrow keys in the map list).
12. Screen-reader smoke (manual on a single page; automated is impractical) — documented in the PR.

### 1.3 Security hardening (§53)
13. **Helmet** is already on from Phase 0; verify the headers and add a strict CSP:
    ```
    default-src 'self';
    script-src 'self' 'nonce-{NONCE}' https://*.sentry.io;
    style-src 'self' 'nonce-{NONCE}';
    img-src 'self' data: blob: https://*.supabase.co https://*.r2.cloudflarestorage.com https://*.amazonaws.com;
    connect-src 'self' https://*.sentry.io wss://<api-host>;
    font-src 'self' data:;
    object-src 'none';
    base-uri 'self';
    frame-ancestors 'none';
    ```
    NONCE generated per request via middleware. Map tiles / Sentry endpoints are explicit allowlist.
14. **CSRF** for state-changing BFF calls: BFF requires a `x-rentuz-csrf` header on POST/PATCH/DELETE; the value is a non-HTTP-readable double-submit token issued via `/api/v1/csrf` (HttpOnly cookie + JSON value). Same-site Lax cookies are not enough on their own for state-changing cross-site requests; the header is. (SameSite=Lax + CSRF header = belt + suspenders.)
15. **CSP nonce**: a small middleware in `apps/web/src/middleware.ts` (renamed to `proxy.ts` for Next 16) generates a nonce per request, attaches it to `req.headers`, and includes it in the CSP header. Documented in `0_Phase.md` §1.
16. **Secrets**: `pnpm audit` + `pnpm dlx secret-scanner` (or `gitleaks`) run in CI on every PR. A `.secrets.baseline` is committed if needed for the seeded `ADMIN_PHONE` placeholder (not a real secret).
17. **Rate-limit review**: every endpoint from `0_Phase.md` §4 has the expected policy. Add a smoke test that hits login 6 times in a minute → 6th returns 429.
18. **Auth**: confirm Argon2id cost params; confirm refresh token reuse detection (Phase 1 test); confirm suspension blocks (Phase 7 test). Add a final test: a tampered JWT is rejected with 401, a JWT with the wrong audience (e.g., the socket ticket secret used as JWT) is rejected.
19. **SQL injection / XSS**: the search SQL uses parameterized queries; verify via integration test that `' OR 1=1 --` in `?city=` doesn't bypass. XSS: a property description with `<script>alert(1)</script>` is rendered as text in the details page (no `dangerouslySetInnerHTML` anywhere).
20. **File security** (§94): audit `image.service.ts` magic-byte check; test SVG with a renamed extension; test a polyglot file (a JPEG with embedded JS) — must be rejected.
21. **Privacy** (§99): owner email/phone are never returned in public endpoints. Verified by a contract test against the public serializer. Private messages are reachable only by participants (Phase 5 test).
22. **Admin audit coverage** (final): `pnpm test:audit-coverage` walks the OpenAPI doc and asserts every mutating `/admin/...` route has a corresponding `@Audit` annotation. Fails if any is missing.

### 1.4 Performance (§68)
23. **Server Components** for the public surface — verify `/`, `/rentals`, `/map`, `/property/[slug]` are RSC and emit zero JS in the initial payload (except for the client islands).
24. **Image optimization** (§68): every `<Image>` uses `priority` for above-the-fold, `sizes` for responsive, and the WebP variants from Phase 2. `next.config.ts` configures `images.formats: ['image/webp']` and `images.remotePatterns` for the Supabase + S3 storage hosts.
25. **Code splitting**: the map component is `dynamic(() => import(...), { ssr: false })` on pages other than `/map`. Charts (`recharts`) are lazy-loaded. The chat composer is lazy.
26. **Bundle budgets**: in `turbo.json` a `size` task fails the build if any chunk in `apps/web` exceeds 200 KB gzipped.
27. **DB**: review query plans for the hot paths (search, details, owner overview). Add `EXPLAIN ANALYZE` snapshots in `apps/api/docs/perf.md` and assert no full table scans.
28. **Caching review** (§97): popular cities, featured properties, and the public configuration are cached in Redis with sane TTLs. A `Cache-Control` audit confirms no user-specific data is in `s-maxage` headers.
29. **Pagination review** (§92): confirm `limit ≤ 100` is enforced on every endpoint; confirm offset pagination is the only place it's used (no offset in map endpoint).
30. **Lighthouse CI**: in CI, run Lighthouse on the 4 main public pages against a built+started stack; fail if performance < 85, accessibility < 95, best-practices < 90, SEO < 95.

### 1.5 Monitoring (§71, §72)
31. **Sentry**:
    - `apps/web` — `@sentry/nextjs` initialized via `sentry.client.config.ts` + `sentry.server.config.ts`. Source maps uploaded on build. Sample rate: 0.1 prod / 1.0 dev.
    - `apps/api` — `@sentry/nestjs` initialized in `main.ts` before the app starts. PII scrubbing on (`users.phone`, `users.email`, `passwordHash`, `refreshTokens.tokenHash`, `Authorization` header). Release tied to git SHA.
32. **Pino JSON logs** in production: shipped to a log aggregator (Loki / Datadog / Better Stack — choice deferred to launch). A small `pino.transport` is configured when `LOG_TRANSPORT=production`. Each request has `requestId`, `userId`, `durationMs`, `status`, `endpoint`.
33. **Health & readiness**: `/health` (liveness — process up) and `/ready` (readiness — DB ping, Redis PING, storage HEAD bucket). `/ready` is wired to Render's health check path.
34. **APM** (optional but recommended): Render's in-built metrics + a `/metrics` Prometheus endpoint (using `prom-client` in the API) for queue size, request latency histograms, active WS connections.
35. **Alerts** (runbook in `apps/api/docs/operations.md`): API error rate > 2%, p95 latency > 800 ms, queue backlog > 1k jobs for 10 min, disk > 80%.

### 1.6 Deployment (§75, §77)
36. **Vercel** — `apps/web`:
    - `vercel.json` (or pure project settings) sets:
      - Build: `pnpm turbo build --filter=web...`
      - Output: `.next`
      - Env: production env from Vercel project settings (no `.env.production` committed)
      - Headers (vercel.json): `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
      - Regions: `fra1` (Frankfurt — closest to UZ)
37. **Render** — `apps/api`:
      - Build: `pnpm turbo build --filter=api...`
      - Start: `node dist/main.js`
      - Instance type: Starter (paid) — see Risks
      - Env from Render secret files; `INTERNAL_API_URL` is the Render service URL
      - Health check path: `/ready`
      - Auto-deploy on `main` after CI green
38. **Supabase**:
      - Create project, get `DATABASE_URL` (pooled, `pgbouncer=true`) and `DATABASE_DIRECT_URL` (port 5432)
      - Storage buckets `rentuz-public` and `rentuz-private` with appropriate policies (public read on the public bucket; signed URL only on the private bucket)
      - PITR on the Pro plan
      - Backups per §95 (daily, 7-day retention; weekly, 30-day)
39. **GitHub Actions**:
    - On PR to `main`: install → lint → typecheck → unit + integration → build → Lighthouse CI → Playwright E2E
    - On push to `main` after green: deploy web to Vercel (via Vercel GitHub integration) and API to Render (via Render GitHub integration; only after CI green)
40. **Domain + DNS**:
      - `rentuz.uz` → Vercel (CNAME / A records per Vercel docs)
      - `api.rentuz.uz` → Render (CNAME)
      - `socket.rentuz.uz` → Render (CNAME; used for the direct WS connection)
      - `www.rentuz.uz` → 301 to apex
      - TLS via Vercel + Render auto-TLS

### 1.7 DoD audit (§100) — last task
41. `apps/web/docs/dod.md` is a checklist mapping every bullet of §100 to its evidence:
    - frontend mavjud → `pnpm --filter web build` succeeds + Lighthouse screenshots
    - backend mavjud → `pnpm --filter api build` succeeds + `/ready` 200
    - API integratsiya qilingan → Phase 5 E2E covers the full request→accept→chat flow
    - authorization ishlaydi → Phase 1 + Phase 7 RBAC tests
    - validation mavjud → Zod on every input
    - loading/empty/error/success states → `apps/web/docs/ui-states.md` enumerates per page
    - responsive → Playwright screenshots at 375/768/1280/1440 px
    - mobile UI → bottom nav per §6
    - tests mavjud → `pnpm test` summary
    - documentation yangilangan → README, `apps/api/docs/`, `apps/web/docs/`, this `context/` directory
    - logs mavjud → pino JSON sample in `apps/api/docs/operations.md`
    - production build muvaffaqiyatli → green CI on the final commit
    - secrets source code ichida yo'q → gitleaks scan in CI

### 1.8 Pre-launch items (not in MVP, but blocking launch)
42. SMS provider (Eskiz.uz or Play Mobile) — implementation is `SmsSender` interface; production env must point at a real driver; `AUTH_OTP_DEV_MODE=false` is a startup assert.
43. MapTiler (or equivalent) API key — `NEXT_PUBLIC_MAP_TILES_URL` set; replace the dev OSM raster with a proper style.
44. Domain + Render paid tier + Supabase Pro PITR.
45. CBU FX endpoint — re-verify at launch; have a last-known rate to fall back on if the call fails.
46. Cookie consent banner — minimal "Biz cookie ishlatamiz" + dismiss. Implement with `apps/web/src/components/CookieBanner.tsx` (small client component, stores choice in localStorage; doesn't gate functionality for MVP).
47. Privacy policy and Terms of Service pages — `/privacy` and `/terms`, content owned by the project owner, served as static MDX.

---

## 2. Database changes
- New migration: `ALTER TABLE properties ADD COLUMN "pausedReason" VARCHAR(40);` (used by Phase 7; applied now if not done already).
- New migration: `CREATE INDEX properties_owner_active_idx ON properties ("ownerId") WHERE status = 'ACTIVE';` — supports the "my active properties" query in the owner dashboard.

---

## 3. Tests (final)

E2E (Playwright) is the final gate; the per-phase E2E suites are run as a single combined suite in CI:
- Full anonymous user journey: home → quick chip → rentals → map → details → favorite (redirect to login) → login → favorite confirmed → request → owner logs in (separate context) → accept → chat
- Full owner journey: register → verify phone → wizard (all 7 steps) → submit → admin approves (separate context) → dashboard shows the property
- Full admin journey: login → verification queue → approve / reject → report resolve → user suspend → audit log entry
- Mobile (375 px) and desktop (1280 px) snapshots of the 4 main public pages attached to the release

Performance:
- Lighthouse: performance ≥ 85, a11y ≥ 95, best-practices ≥ 90, SEO ≥ 95 on all 4 public pages
- API p95 latency for `/search/properties` (warm cache miss) < 250 ms with 100k seeded properties (synthetic seed in CI)

Security final:
- OWASP ZAP baseline scan against the staging URL; no high-severity alerts
- A penetration test script runs the spec §79 cases: RBAC bypass, auth bypass, injection, upload validation, rate limit, unauthorized access — all expected failures

---

## 4. Definition of Done (the §100 audit)
- All paths in §1 implemented; the §100 checklist in `apps/web/docs/dod.md` is green
- Production deploy from a clean checkout succeeds
- Smoke run after deploy: anonymous user can search and view a property; logged-in tenant can submit a request; logged-in admin can approve a verification; chat works between tenant and owner across the Vercel→Render WS hop
- The pre-launch items list (§1.8) is owned by named people and dated

## 5. Risks & escape hatches (final)

- **Nest 12 ecosystem gap** — the Phase 0 escape hatch (drop to Nest 11.2.3 + `@nestjs/throttler` + `nestjs-zod`) is still available. By Phase 8 it's almost certainly not needed; recorded for the record.
- **ESM/CJS** — Phase 0 fallback documented. Not exercised in production; the ESM path has been green since Phase 1.
- **Prisma + PostGIS raw SQL** — contained in 2 repositories. Integration tests cover the SQL surface; a refactor to a custom Prisma extension or Drizzle is possible if the raw SQL becomes unwieldy.
- **Supabase connection pooler + prepared statements** — `pgbouncer=true` is set; tests confirm no "prepared statement already exists" errors under load.
- **PostGIS schema drift** — `extensions` schema + `search_path=public,extensions` set in every env. CI integration tests would fail loudly if a query referenced `public.ST_DWithin`.
- **Vercel cannot proxy WebSockets** — Phase 5 ticket flow + direct connection. Documented; no fallback needed.
- **Render free tier sleeps** — paid Starter in production (pre-launch item). Without it, the API would cold-start on first hit; the ticket flow hides this for chat but REST would be slow.
- **Supabase Storage has no lifecycle** — the orphan cleanup job from Phase 2 + the chat attachment TTL from Phase 5 are the explicit mechanism. **Production launch gate**: confirm the cron is registered and the `CHAT_ATTACHMENT_TTL_DAYS` env is set (default 30).
- **Vitest 5.0.0 freshness** — Phase 0 pinned 4.1.11 deliberately. Upgrade in a low-risk window after launch.
- **FX rate source** — CBU is a soft dependency; the FX service falls back to the last-known rate and the price-change notification explicitly marks the rate source and timestamp.
- **Real SMS provider** — `AUTH_OTP_DEV_MODE=true` is asserted false at production startup. Pre-launch: pick a provider, set the env, verify a test SMS.
- **Sentry PII scrubbing** — the Sentry config explicitly drops `users.phone`, `users.email`, `passwordHash`, and `Authorization`. A test asserts that a thrown error containing those fields shows them as `***` in the Sentry payload.
- **OpenAPI drift** — `@nestjs/swagger` is wired; the contract test in §1.3 task 22 walks the document and fails CI on drift. New routes must update the schema.
- **Sitemap size** — at 100k+ active properties, a single sitemap file is too large. The pagination logic in `1` is in place from day one; the 50k/page threshold is documented.
- **Lighthouse environment flakiness** — CI Lighthouse runs in a `lighthouse-ci` action with 3 runs averaged; threshold is 5 points below the local measurement to absorb variance.

---

## 6. Final summary of the plan

This plan delivers RentUZ MVP in 8 phases, with the work front-loaded in phases 0–2 (foundation + data + first vertical slice through the owner wizard) and back-loaded in 7–8 (admin + hardening). The vertical slices from 3 onward (search, requests, chat, notifications, analytics, admin) are each shippable in their own right. The cross-cutting decisions in `0_Phase.md` are the load-bearing ones: ESM, BFF auth, PostGIS raw-SQL containment, currency normalization, and the version pins. Every later phase references them and never restates them, so the total document stays in sync by construction.

### Pre-launch items list (final, to be assigned)

1. SMS provider selection + integration + env (Eskiz.uz or Play Mobile)
2. MapTiler key + production tile style URL
3. `rentuz.uz` domain + DNS + Render paid tier + Supabase Pro PITR
4. CBU FX endpoint re-verification at launch
5. Cookie consent banner (in `apps/web`)
6. Privacy policy + Terms of Service content
7. Sentry project + DSN
8. Log aggregator account (Loki / Datadog / Better Stack)
9. Sitemap hosting decision (Vercel route is fine; verify under load)
10. Penetration test of the staging environment
