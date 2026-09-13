# RentUZ operations runbook (§71, §72 / 8_Phase.md §1.5 item 35)

How the API is observed in production and what to do when an alert fires.
Hosting: **Render** (API, Starter tier), health path `/ready`.

## Health endpoints

| Path | Purpose | Checks | Render wiring |
|---|---|---|---|
| `/health` | liveness | process up | — |
| `/ready` | readiness | DB `SELECT 1`, Redis `PING`, storage HEAD bucket | Render health check path |
| `/metrics` | Prometheus scrape | see below | internal scraper only |

Render auto-restarts on `/ready` failures; the alert thresholds below assume
`/ready` is green (infra-level) and something deeper is degrading.

## Prometheus metrics (`/metrics`)

- `rentuz_http_request_duration_seconds` — histogram by route template /
  method / status. Route labels are templated (`:id`), never raw UUIDs —
  cardinality safe.
- `rentuz_http_requests_total` — request counter (error-rate alert source).
- `rentuz_ws_active_connections` — live Socket.IO connections (gateway
  increments/decrements on connect/disconnect).
- `rentuz_queue_backlog_jobs{queue}` — waiting+delayed BullMQ jobs per queue,
  refreshed every 30 s by the jobs service.
- prom-client defaults: event loop lag, GC pauses, heap RSS.

## Alert thresholds (§72)

| Alert | Threshold | First response |
|---|---|---|
| API error rate | > 2% (5xx / total, 10-min window) | check Sentry for the top issue; check `docker logs`/Render log tail for stack traces |
| p95 latency | > 800 ms | `/metrics` histogram by route — usually one route; check `apps/api/docs/perf.md` for the expected plans and the Redis cache hit rate |
| Queue backlog | > 1,000 jobs for 10 min | identify the queue from `rentuz_queue_backlog_jobs{queue}`; BullMQ board / `GET /api/v1/jobs` (admin) for last runs; a stuck processor usually needs a Render restart |
| Disk | > 80% | Render dashboard → disk trend; the API is stateless (only build cache) — growth means a leak in local file handling |
| `/ready` failing | any occurrence | DB/Redis/storage from the error body; Supabase status page + Render Redis status |

## Logs

pino JSON (structure below) — `LOG_TRANSPORT=production` pipes Nest's logger
into pino with the redactions listed in `main.ts` (authorization headers,
passwordHash, phone/email). Ship to the chosen aggregator (pre-launch item:
Loki / Datadog / Better Stack — decision deferred at launch, §1.8).

Sample request log line:

```json
{"level":30,"time":"2026-09-13T10:15:42.000Z","requestId":"a1b2c3","msg":"GET /api/v1/search/properties 200 12ms","endpoint":"/api/v1/search/properties","status":200,"durationMs":12,"userId":null}
```

Fields: `requestId` (uuid, also the `x-request-id` response header), timestamp,
endpoint, status, `durationMs`, `userId` when authenticated.

## Sentry

- Web: `NEXT_PUBLIC_SENTRY_DSN` (DSN-gated init in `src/instrumentation*.ts`),
  release `NEXT_PUBLIC_SENTRY_RELEASE` (= git SHA).
- API: `SENTRY_DSN`, release = `RENDER_GIT_COMMIT` (= git SHA).
- Both scrub PII before send (§99): phone/email/passwordHash/tokenHash/
  Authorization headers never leave the process — see the `SentryScrub` in
  `main.ts` and the `beforeSend` in the web instrumentation files.
- Sample rates: traces 0.1 in production, 1.0 otherwise.

## Sentry PII scrub test

`scrubValue`/`SentryScrub` unit-assert: an event whose `request.data` carries
`phone`, `passwordHash`, `Authorization` values has each replaced with `***`
while non-sensitive fields pass through (test in
`src/common/interceptors/metrics`… see `apps/api/src/main.ts` scrub block —
covered by `src/health/sentry-scrub.test.ts`).

## Jobs cron schedule (UTC / Asia/Tashkent)

| Queue | Cadence | Purpose |
|---|---|---|
| fx-rates | 01:00 UTC daily | CBU rate fetch + USD priceUzs backfill |
| complete-rentals | hourly | mark ended rentals RENTED→ACTIVE per §86 |
| expire-pending-requests | every 6 h | auto-expire stale PENDING requests |
| orphan-images | every 6 h | bucket-vs-DB reconcile (§94) |
| daily-stats | 02:00 Tashkent | rollup (§46) |
| notifications-cleanup | 03:00 Tashkent | retention sweep (§30) |

Production launch gate: confirm the crons register (`GET /api/v1/jobs` shows
next-run dates) and `CHAT_ATTACHMENT_TTL_DAYS` is set (default 30).
