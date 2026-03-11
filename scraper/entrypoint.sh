#!/bin/sh
set -eu

STARTUP_DELAY="${STARTUP_DELAY:-0}"
case "$STARTUP_DELAY" in
  ''|*[!0-9]*) STARTUP_DELAY=0 ;;
esac

if [ "$STARTUP_DELAY" -gt 0 ]; then
  sleep "$STARTUP_DELAY"
fi

# Discovery crawler runs Scrapy directly (not an RQ worker)
if [ "${WORKER_NAME:-}" = "discovery" ]; then
  exec python -c "from spiders.discovery import run_discovery; run_discovery()"
fi

if [ -n "${WORKER_NAME:-}" ]; then
  WORKER_CONCURRENCY="${WORKER_CONCURRENCY:-1}"

  # Use custom worker pool with SimpleWorker (no fork-per-job overhead)
  exec python worker_pool.py "$WORKER_NAME" "$WORKER_CONCURRENCY"
fi

exec "$@"
