# Definition of Done audit (§100 / 8_Phase.md §1.7)

Every §100 bullet mapped to its evidence, audited 2026-09-13 (Phase 8,
branch `feature/phase-8-hardening`). Verification matrix below was run on the
final commit of this phase.

| §100 requirement | Evidence | Status |
|---|---|---|
| Frontend mavjud | `pnpm --filter web build` ✓ (35 routes prerendered/SSG/ISR); Lighthouse local run green (`lighthouserc.cjs` thresholds passed) | ✅ |
| Backend mavjud | `pnpm --filter api build` ✓; `GET /ready` → 200 against the docker stack (DB+Redis+storage pinged) | ✅ |
| API integratsiya qilingan | Phase 5 E2E chat spec (`e2e/chat-flow.spec.ts`): request→accept→chat realtime incl. attachments; full E2E 30/30 | ✅ |
| Authorization ishlaydi | Phase 1 + 7 RBAC integration tests (`auth-flows`, `admin-moderation`); non-admin → /forbidden E2E | ✅ |
| Validation mavjud | Zod contracts on every input (`packages/contracts`); global StandardSchemaValidationPipe; `limit=101` → 400 test | ✅ |
| Loading/empty/error/success states | `apps/web/docs/ui-states.md` (page-by-page inventory) | ✅ |
| Responsive | Bottom nav (56px slots) + desktop layouts; a11y/E2E run at default viewport; Lighthouse `preset: desktop` + mobile-first Tailwind (§6) | ✅ |
| Mobile UI | `BottomNav` (7 slots + admin 8th), sticky mobile CTA on details (§20) | ✅ |
| Tests mavjud | Unit 199 (contracts 76 + api 123), integration 110, E2E 30 (incl. a11y 13), security suites (CSRF/JWT/SQLi/XSS/file/privacy/audit-coverage) | ✅ |
| Documentation yangilangan | README, `apps/api/docs/{operations,deployment,perf}.md`, `apps/web/docs/{a11y,ui-states,dod}.md`, `context/0–8_Phase.md` reconciled | ✅ |
| Logs mavjud | pino JSON sample in `apps/api/docs/operations.md`; `LOG_TRANSPORT=production` wiring in `main.ts` | ✅ |
| Production build muvaffaqiyatli | `pnpm build` green locally; CI runs build + deploy gate on push to main (Vercel/Render integrations) | ✅* |
| Secrets source code ichida yo'q | gitleaks job in CI; only `.env.example` committed; production startup asserts for dev flags | ✅ |

\* CI-green-on-PR is the remaining external step (requires pushing the branch
— covered by the merge checklist below).

## Security checklist (§53/§94/§99)

- Helmet + strict CSP (`apps/web/src/proxy.ts`), CSRF double-submit enforced
  at the BFF (curl matrix: no-header POST → 403; header → API; refresh exempt).
- Auth: Argon2id, refresh rotation + reuse detection (Phase 1 tests), 15-min
  access tokens, HttpOnly cookies, socket ticket 60s single-use.
- Rate limits: login 5/min (429 on 6th — tested), per-route Throttle policies.
- Uploads: magic bytes, SVG rejected, JPEG-polyglot EOI guard (tested), ≤10MB.
- Privacy: public serializers structurally omit owner phone/email (tested);
  Sentry PII scrub unit-tested.
- Audit: every mutating admin route carries @Audit (metadata gate test) —
  verification `:claim` exempt by documented design.

## Performance (§68)

- Bundle budget enforced: 51 chunks, max 256 KB gzipped = the lazy maplibre
  vendor chunk (400 KB lazy budget); everything else ≤ 200 KB (`size-check`).
- `next/image` on card grids + details hero (priority, sizes, WebP).
- DB plans in `apps/api/docs/perf.md` (owner-active partial index picked up).
- Lighthouse: perf ≥ 80 / a11y ≥ 90 / bp ≥ 85 / SEO ≥ 90 on /, /rentals,
  /map, /privacy × 3 runs — green locally, same thresholds in CI.

## Remaining external items (pre-launch, owner-assigned)

Tracked in `apps/api/docs/deployment.md` §7: SMS provider, MapTiler key,
domain + paid tiers, CBU re-verify, Sentry DSNs, log aggregator, sitemap
under load, penetration test. Code-side counterparts are all shipped.

## Merge checklist

1. Push `feature/phase-8-hardening`, open PR → CI (lint/typecheck/unit/
   integration/build/E2E/gitleaks/Lighthouse) must be green.
2. Reconcile `context/8_Phase.md` status column (done in this branch).
3. Merge to `main` → Vercel + Render auto-deploy (post-deploy smoke list in
   `apps/api/docs/deployment.md` §5).
