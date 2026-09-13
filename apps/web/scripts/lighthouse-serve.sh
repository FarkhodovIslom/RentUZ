#!/usr/bin/env bash
# Boots the built API (:4000) + web (:3000) for Lighthouse CI (8_Phase.md §1.4).
# The stack must already be running via docker compose + seed + builds — CI
# runs this after the build step. Exits when both ports answer.
set -euo pipefail
cd "$(dirname "$0")/../../.."   # repo root (apps/web/scripts -> repo)

# API + web up as DIRECT children of this shell so `wait` below blocks.
# LHCI kills the whole process group when the audit finishes.
(cd apps/api && PORT=4000 DISABLE_JOBS=true DISABLE_THROTTLE=true exec node dist/main.js) &
API_PID=$!
(cd apps/web && INTERNAL_API_URL=http://localhost:4000 NEXT_PUBLIC_SOCKET_URL=http://localhost:4000 exec pnpm start) &
WEB_PID=$!

# Wait for readiness, then STAY in the foreground — LHCI kills the whole
# process group when the audit finishes; exiting early would take the
# background servers with it and Chrome hits an interstitial.
for i in $(seq 1 60); do
  if curl -sf http://localhost:4000/health > /dev/null 2>&1 && curl -sf -o /dev/null http://localhost:3000/login; then
    echo "stack ready for connections"
    # Foreground forever — LHCI terminates the group at shutdown.
    wait "$API_PID" "$WEB_PID"
  fi
  sleep 2
done
echo "stack failed to become ready" >&2
kill "$API_PID" "$WEB_PID" 2>/dev/null || true
exit 1
