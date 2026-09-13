# Phase 8 walkthrough — SEO, A11y, Security, Performance, Monitoring, Deployment, DoD

**Date:** 2026-09-13 · **Branch:** `feature/phase-8-hardening` (from `main`)
**Plan:** `.kilo/plans/1789293280405-phase-8-hardening-deployment.md`
**Authoritative context:** `context/8_Phase.md` (status section updated),
`context/0_Phase.md` (traps 3/12/13/15/18 respected throughout).

## Task

The final hardening phase before launch: SEO pass, accessibility sweep,
security checklist (CSRF/CSP/tests), performance budgets, Sentry + metrics,
deployment configs + expanded CI, pre-launch code items (cookie banner, legal
pages), and the §100 DoD audit. Two inherited blockers fixed first: the
Phase-1 locations seed had been lost (clean checkout couldn't seed) and the
owner-dashboard partial index was missing.

## Files changed (by block)

**Block 0 — foundation blockers**
- `apps/api/prisma/seed.ts` — Phase-1 locations (14 regions + districts)
  restored as idempotent upserts before property creation.
- `apps/api/prisma/migrations/20260913090000_phase8_owner_active_idx/` —
  `properties_owner_active_idx` partial index + GiST re-add (trap 3/18).

**Block 1 — SEO**
- `apps/web/src/app/sitemap.ts` (50k chunks via `generateSitemaps`),
  `robots.ts` (disallow additions), `(public)/property/[slug]/page.tsx`
  (§69 title format, canonical, OG/Twitter, JSON-LD `RealEstateListing`
  with script-breakout escaping, `generateStaticParams` top-500, ISR 600s),
  page metadata for `/`, `/rentals`, `/map` + auth pages (noindex),
  `manifest.ts`, `icon.tsx`, `.env.example` (`NEXT_PUBLIC_SITE_URL`).
- `packages/contracts/src/search.ts` + API public-properties service —
  `regionName` on the public detail DTO.
- ISR revalidation hook: `apps/web/src/app/api/revalidate/route.ts`
  (`REVALIDATE_SECRET` bearer) + API `WebRevalidateService` on the
  property.* event bus (env-gated, fire-and-forget).

**Block 2 — A11y**
- `e2e/a11y.spec.ts` (axe serious/critical gate, 9 pages + keyboard flows),
  `test:a11y` script + turbo task; `SkipLink` in all 5 route layouts,
  `main#main-content`; RentalRequestModal Esc + focus return; Pagination
  roving arrows; reduced-motion + MapLibre attribution contrast in
  `globals.css`; fg-muted token `#6f6f6f`→`#858585` (AA fix);
  `apps/web/docs/a11y.md` (contrast math + inventory).

**Block 3 — Security**
- CSRF: `packages/contracts/src/csrf.ts`, API `CsrfController`
  (`GET /api/v1/csrf` double-submit), BFF check in `apps/web/src/lib/proxy.ts`
  (header vs HttpOnly cookie; `/csrf` + `/auth/refresh` exempt),
  `lib/api.ts` fresh-per-call token fetch (memo went stale vs the rotated
  cookie — the chat E2E wedged on it), socket ticket + chat attachment +
  read receipts carry the header; all E2E helpers/specs updated.
- CSP: `apps/web/src/proxy.ts` (Next 16 proxy; Turbopack does not propagate
  request nonces — script-src keeps `unsafe-inline`, documented; ws(s)
  schemes + map tile hosts + Sentry/storage allowlists).
- Tests: `test/security-csrf-ratelimit.integration.test.ts` (issue/rotate,
  login 429 on 6th, tampered JWT 401, wrong-audience socket JWT 401, SQLi
  city param, public serializer privacy),
  `src/modules/admin/admin-audit-coverage.test.ts` (mutating admin routes
  must carry @Audit; `verification/:id/claim` exemption documented),
  `src/common/services/image-security.test.ts` (SVG-renamed + JPEG/JS
  polyglot reject — new EOI-tail guard in `image.service.ts`),
  `e2e/security-xss.spec.ts` (payload renders as text, no dialogs).
- `PropertyMiniMap` nested-interactive fix (attribution → figcaption).

**Block 4 — Performance**
- `next.config.ts` (WebP formats, Supabase/S3/R2 remotePatterns);
  PropertyCard + details hero on `next/image` (hero priority);
  `scripts/size-check.mjs` + turbo task (200 KB / lazy 400 KB budget, 51
  chunks pass); `apps/api/docs/perf.md` (EXPLAIN snapshots — new partial
  index picked up by the owner dashboard query; seed-geo caveat noted).

**Block 5 — Monitoring**
- `@sentry/nextjs` via `src/instrumentation.ts` + `-client.ts` (DSN-gated,
  0.1 prod / 1.0 dev); `@sentry/nestjs` in API `main.ts` with PII scrub
  (`SentryScrub`, unit-tested) + `LOG_TRANSPORT=production` pino piping;
  `/metrics` (prom-client: HTTP histogram/counter via global
  `MetricsInterceptor` with route-template labels, WS gauge in the gateway,
  queue backlog via the jobs service, prom defaults);
  `apps/api/docs/operations.md` (alert thresholds, log sample, cron table).

**Block 6 — Deployment + CI**
- `apps/web/vercel.json` (headers), `render.yaml` (blueprint), full runbook
  `apps/api/docs/deployment.md` (Supabase pooled/direct, buckets, DNS
  table, smoke checklist, pre-launch items §1.8);
  `.github/workflows/ci.yml` (PostGIS+Redis services, integration, trap-15
  reseed, build, size-check, E2E, gitleaks job, Lighthouse job);
  `lighthouserc.cjs` + `apps/web/scripts/lighthouse-serve.sh`.

**Block 7 — pre-launch code**
- `apps/web/src/components/CookieBanner.tsx` (+ layout mount, uz messages,
  suite-wide pre-dismissal via storageState, own E2E spec);
  `/privacy` + `/terms` pages (placeholder legal content).

**Block 8 — DoD**
- `apps/web/docs/dod.md` (§100 → evidence), `apps/web/docs/ui-states.md`,
  `context/8_Phase.md` completion-status section, this walkthrough.

## Verification performed (AGENTS.md order, all green)

1. `pnpm lint`, `pnpm typecheck`
2. `pnpm test` — 199 unit (contracts 76 + api 123)
3. `pnpm --filter api test:integration` — 110 (incl. the new security suite)
4. `pnpm --filter api db:seed` — clean-checkout path also verified on a
   scratch DB: `migrate deploy` + `db:seed` → 14 regions, 120 properties
5. `pnpm build` (+ `size-check` — 51 chunks within budget)
6. `pnpm --filter web test:e2e` — 30/30 (incl. a11y 13/13, XSS, cookie banner)
7. Lighthouse assertions (/, /rentals, /map, /privacy × 3 runs) — green
8. CSRF curl matrix (403 / pass / refresh-exempt), `/metrics` live check

## Key decisions & traps hit

- **ISR + DYNAMIC_SERVER_USAGE**: server-side `getSession()` in Navbar/
  BottomNav and `headers()` in the layout made every public page dynamic;
  moved the admin nav slots client-side and dropped the nonce read (Next
  reads the CSP from the request instead — Turbopack's script-nonce support
  turned out absent, so `strict-dynamic` was dropped for `'unsafe-inline'`
  with a documented rationale).
- **CSRF token freshness**: a memoized token desyncs from the rotated
  HttpOnly cookie the moment anything else fetches `/csrf`; the fetcher is
  now fresh-per-call with a shared in-flight promise.
- **Gitleaks env audit**: only `.env.example` files are tracked; no
  `.secrets.baseline` needed.
- **Lighthouse /login**: auth pages are noindex by design (§69) and would
  fail the SEO gate — `/privacy` stands in as the fourth audited route.

## Remaining limitations / handoff

- External pre-launch items (SMS provider, MapTiler key, domain/DNS, paid
  tiers, CBU re-verify, Sentry DSNs, log aggregator, sitemap load check,
  pentest) — owner-assigned in `apps/api/docs/deployment.md` §7.
- `/privacy` + `/terms` content is a structural placeholder pending legal
  review; the pages themselves are final.
- CI has not run on GitHub yet (branch unpushed) — the merge checklist in
  `apps/web/docs/dod.md` gates on a green draft PR.
- Prod-deploy smoke (§5 of the runbook) runs after the first real deploy.
