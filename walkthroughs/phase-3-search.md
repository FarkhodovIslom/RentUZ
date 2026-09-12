# Phase 3 finish — E2E fixes, verification gate (2026-09-11)

## Task

Close out Phase 3 (search / map / details / favorites per `.kilo/plans/1789043298417-phase-3-search-map.md` and `context/3_Phase.md` §3): the E2E suite was 2/4 passing with two blocked specs (`anonymous-favorite`, `map-drag`). This session fixed the root causes behind both, plus two more defects the unblocked specs then exposed, and ran the full verification gate.

## Root causes fixed

### 1. Auth submit buttons always showed the "submitting" label (blocked `anonymous-favorite`)

All four auth forms rendered `tCommon('submitting')` ("Yuborilmoqda...") unconditionally as the submit button's children — the idle `cta` label ("Kirish") was never rendered, so `getByRole('button', { name: 'Kirish', exact: true })` could never match.

- `apps/web/src/components/auth/LoginForm.tsx` — `{isSubmitting ? tCommon('submitting') : t('cta')}`
- Same copy-paste defect fixed in `RegisterForm.tsx`, `ForgotPasswordForm.tsx`, `ResetPasswordForm.tsx`.

### 2. Map viewport was hard-coupled to the basemap's `onLoad` (blocked `map-drag`)

Diagnosis (wrapper internals verified): `@vis.gl/react-maplibre` 8.1.3 event-prop wiring is correct. The style depends on external hosts (`tile.openstreetmap.org` throttles headless UAs; `demotiles.maplibre.org` glyphs), maplibre's `load` only fires from a completed render after the style reaches loaded state, and `MapView` had no `onError` — so failures were silent and, in `MapExplorer`, `urlState` started as `null`: markers never fetched and the URL was never written unless `onLoad` fired.

- `apps/web/src/components/map/MapExplorer.tsx` — when `/map` is opened without URL params, seed `DEFAULT_VIEWPORT` (Tashkent, zoom 10.5) instead of `null` and write it to the URL on mount (`syncUrl` in a mount effect). `urlState` is now non-nullable; the first-move "seed from event" branch was removed. Markers/URL no longer depend on the basemap loading.
- `apps/web/src/components/map/MapView.tsx` — added `onError={(e) => console.error('[MapView]', e.error)}`; removed the temporary `emitViewport` debug log.
- `apps/web/e2e/map-drag.spec.ts` — made hermetic: `page.route` stubs OSM tiles (1×1 PNG) and demotiles glyphs (empty PBF) so `load`/camera events fire deterministically offline. Assertions unchanged.
- Deleted stale debug harnesses `e2e/map-probe.mjs` and `e2e/raw-probe.mjs` (raw-probe targeted a webpack chunk that no longer exists under Turbopack).

### 3. Favorite toast showed the wrong message (newly exposed by `tenant-favorite`)

`FavoriteButton`'s `onSuccess` read `isFavorite` from the latest render — which the optimistic update had already flipped — so a successful **add** toasted "Saqlanganlardan olib tashlandi" (removed). The toggle intent is now captured at `mutate()` time (`mutation.mutate(isFavorite)` → `mutationFn`/`onSuccess` receive `wasFavorite`). `apps/web/src/components/favorites/FavoriteButton.tsx`.

### 4. Detail heart's `aria-label` hid the "Saqlangan" accessible name (newly exposed)

The detail-variant button had `aria-label="Saqlanganlardan olib tashlash"` overriding its visible text, so `getByRole('button', { name: 'Saqlangan', exact: true })` could never match. Dropped the redundant `aria-label` on the detail variant (visible text is the accessible name; icon-only card variant keeps its label). Same file.

### 5. `/favorites` RSC never sent the session cookie (newly exposed)

`serverApiGet` (`apps/web/src/lib/server-api.ts`) fetched the Nest API without forwarding cookies; the authenticated `/favorites` page swallowed the 401 and rendered "0 ta e'lon" + empty state for logged-in users. Now forwards `cookies().toString()` — the guard (`jwt-auth.guard.ts`) accepts the `rentuz_at` cookie, matching the pattern in `lib/session.ts`.

### 6. Spec selector precision

Both favorite specs clicked `getByRole('button', { name: 'Saqlash' }).first()`, which hit a similar-properties card heart instead of the sidebar detail heart (the replay then favorited the wrong property). Both now scope to `page.locator('aside').getByRole(...)`, and the favorites-page heading assertion uses `exact: true` (substring collision with the empty-state h3).

## Files changed

- `apps/web/src/components/auth/{LoginForm,RegisterForm,ForgotPasswordForm,ResetPasswordForm}.tsx`
- `apps/web/src/components/map/MapExplorer.tsx`, `apps/web/src/components/map/MapView.tsx`
- `apps/web/src/components/favorites/FavoriteButton.tsx`
- `apps/web/src/lib/server-api.ts`
- `apps/web/e2e/map-drag.spec.ts`, `apps/web/e2e/anonymous-favorite.spec.ts`, `apps/web/e2e/tenant-favorite.spec.ts`
- Deleted: `apps/web/e2e/map-probe.mjs`, `apps/web/e2e/raw-probe.mjs`

## Verification

Environment: colima (Docker) restarted; `rentuz-db/-redis/-minio` compose stack healthy; prior migrations + seed intact.

| Gate | Result |
| --- | --- |
| `pnpm lint` | ✓ 4/4 tasks |
| `pnpm typecheck` | ✓ 5/5 tasks |
| `pnpm test` (unit) | ✓ 46/46 (api), all files pass |
| `pnpm --filter api test:integration` | ✓ 35/35 |
| `pnpm build` (turbo) | ✓ |
| `pnpm --filter web test:e2e` | ✓ **5/5** (home-chip, rentals-sort, anonymous-favorite, map-drag, tenant-favorite), run twice |

Note: the E2E web server logs a benign Next.js "The destination stream closed early" digest when the anonymous-favorite spec navigates away mid-RSC-stream (favorite → login redirect); no test impact.

## Remaining limitations

- Real-browser basemap still uses external OSM tiles / demotiles glyphs; only the E2E mocks them. If tiles are unreachable in a browser, `/map` still works (default bbox seeded, markers load) but tiles won't render. A future improvement could self-host glyphs/basemap.
- `MapView` is rendered inside client components but not `dynamic(..., { ssr: false })` like `LazyMiniMap`; maplibre instantiation is client-side (`useEffect`), so this is safe today.
- The server-rendered `Navbar` always shows the "Kirish" link (no session awareness server-side); the favorites badge is client-side. Cosmetic, not Phase 3 scope.
- No commits made (per AGENTS.md workflow).
