# RentUZ production deployment runbook (§75 / 8_Phase.md §1.6)

How the MVP ships: **Vercel** (web) + **Render** (API, Starter) + **Supabase**
(Postgres/PostGIS + Storage) + **auth0-style DNS** on `rentuz.uz`. External
accounts/keys are pre-launch items (§1.8) — this runbook documents the exact
steps and env wiring, not account creation.

## 1. Supabase (database + storage) (§95)

1. Create the project (region: Frankfurt, closest to UZ users among Supabase's
   regions). PostGIS is pre-installed in the `extensions` schema — our
   migrations already assume that shape (`SET search_path = public,
   extensions;` in every geo-touching migration).
2. Connection strings (Project settings → Database):
   - `DATABASE_DIRECT_URL` — port **5432**, direct connection. **Migrations
     only** (`prisma migrate deploy` against it).
   - `DATABASE_URL` — port **6543**, pgBouncer pooler with
     `?pgbouncer=true&connection_limit=1`. **Runtime only**
     (prepared statements disabled on this path — Prisma 7's driver adapter
     handles it; the Phase 7 tests cover the query surface).
   - Both URLs need `&search_path=public,extensions` appended.
3. Run migrations once from a machine with the direct URL:
   `DATABASE_DIRECT_URL=... pnpm --filter api exec prisma migrate deploy`
4. Storage buckets: create `rentuz-public` (public read) and `rentuz-private`
   (signed URLs only). Bucket policies per §94: public = `s3:GetObject` for
   `*`; private = no public access, the API presigns GETs (chat attachments).
5. Backups (§95): enable PITR (Pro plan, pre-launch item) — point-in-time
   restore for the DB; Supabase daily snapshots cover the rest. Retention:
   daily 7 days, weekly 30 days.
6. `STORAGE_*` + `PUBLIC_STORAGE_BASE_URL` envs point at Supabase's S3
   gateway (endpoint `https://<ref>.supabase.co/storage/v1`, keys from
   Settings → Storage).

## 2. Render (API) — `render.yaml` at the repo root

1. Dashboard → New → Blueprint → pick the repo. The blueprint provisions the
   `rentuz-api` web service: Node, Starter plan (paid — free tier sleeps),
   Frankfurt, build `pnpm turbo build --filter=api...`, start
   `node dist/main.js`, health `/ready`, auto-deploy from `main`.
2. Fill the `sync: false` envs from the dashboard (see `render.yaml` for the
   full list). Non-negotiables in production (startup asserts in
   `env.ts` will refuse to boot otherwise):
   - `JWT_ACCESS_SECRET`, `SOCKET_TICKET_SECRET` ≥ 32 chars
   - `AUTH_OTP_DEV_MODE=false`, `AUTO_APPROVE_LISTINGS=false`
   - `SMS_PROVIDER` real provider (console is loud-warned, not fatal)
3. Redis: Render's managed Redis (or Key Value) — internal URL into
   `REDIS_URL`.
4. `WEB_INTERNAL_URL` = the Vercel production URL + `REVALIDATE_SECRET`
   (shared random ≥32 chars) — enables the API → web ISR revalidation hook
   (`/api/revalidate`).

## 3. Vercel (web) — `apps/web/vercel.json`

1. Import the repo; Root Directory `apps/web`; framework auto-detected.
   The `vercel.json` build command (`pnpm turbo build --filter=web...`) builds
   `packages/*` first.
2. Env (Production): `INTERNAL_API_URL=https://api.rentuz.uz`,
   `NEXT_PUBLIC_SOCKET_URL=wss://api.rentuz.uz` (direct WS — Vercel cannot
   proxy WebSockets, §1 trap 8), `NEXT_PUBLIC_SITE_URL=https://rentuz.uz`,
   `NEXT_PUBLIC_MAP_TILES_URL` (MapTiler style URL — pre-launch key),
   `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_RELEASE` (git SHA),
   `REVALIDATE_SECRET` (same value as Render's).
   **Build-time note**: `NEXT_PUBLIC_*` are inlined — set them BEFORE the
   first production build.
3. Region: `fra1` (Frankfurt) — set in the dashboard (project → Regions).
4. Headers ship via `vercel.json`: HSTS preload, nosniff,
   Referrer-Policy, Permissions-Policy. CSP is emitted per-request by
   `apps/web/src/proxy.ts`.

## 4. DNS — `rentuz.uz` (§1.6 item 40)

| Record | Type | Target | Notes |
|---|---|---|---|
| `rentuz.uz` | CNAME/A | Vercel (`cname.vercel-dns.com` / 76.76.21.21) | Vercel docs give the exact record on domain add |
| `www.rentuz.uz` | CNAME | `cname.vercel-dns.com` | Vercel redirects www → apex 301 |
| `api.rentuz.uz` | CNAME | Render service (`rentuz-api.onrender.com` style host) | Render's custom-domain page shows the exact value |
| `socket.rentuz.uz` | CNAME | same Render host | optional — the socket client uses `NEXT_PUBLIC_SOCKET_URL`; pointing it at a dedicated subdomain allows splitting WS traffic later |

TLS: automatic on both platforms (Let's Encrypt via Vercel/Render).
Verify: `curl -sI https://rentuz.uz` (200 + HSTS header),
`curl -s https://api.rentuz.uz/health`.

## 5. Post-deploy smoke run (§100)

- Anonymous: home loads, search returns listings, a property page opens
  (check `link rel=canonical`), map tiles render (MapTiler key working).
- Tenant: login → submit rental request → 201.
- Owner: accept the request; tenant sees the rental under /my-rentals.
- Admin: verification queue loads; approve a listing → it appears in search.
- Chat: tenant ↔ owner messages flow over `wss://api.rentuz.uz` (the
  Vercel→Render WS hop).
- `/ready` 200 on the API; `/metrics` answers (internal only).

## 6. CI → deploy gating (§77)

PR to `main`: install → lint → typecheck → unit → integration (PostGIS+Redis
services) → build → gitleaks → Playwright E2E (+ a11y + size-check). Push to
`main` with green CI: Vercel + Render auto-deploy via their GitHub
integrations — CI is the gate, the platforms do the shipping.

## 7. Pre-launch checklist (external, blocking launch — §1.8)

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | SMS provider (Eskiz.uz / Play Mobile) + real driver env + test SMS | — | ☐ |
| 2 | MapTiler key + `NEXT_PUBLIC_MAP_TILES_URL` production style | — | ☐ |
| 3 | `rentuz.uz` domain purchase + DNS + Render Starter + Supabase Pro (PITR) | — | ☐ |
| 4 | CBU FX endpoint re-verify at launch (last-known fallback in place) | — | ☐ |
| 5 | Cookie banner (shipped in-code, Phase 8) | — | ☑ code |
| 6 | Privacy policy + Terms content on `/privacy`, `/terms` (pages shipped; content owner review) | — | ☑ code / ☐ content |
| 7 | Sentry projects + DSNs (web + API) | — | ☐ |
| 8 | Log aggregator account (Loki / Datadog / Better Stack) | — | ☐ |
| 9 | Sitemap under load check (Vercel route) | — | ☐ |
| 10 | Penetration test (staging) + OWASP ZAP baseline | — | ☐ |
