#!/bin/bash
set -e

# xvfb-run deadlocks against stale /tmp/.X*-lock files left by a previous
# container/crash, hanging as PID 1 so the container looks "Up" but Python
# never starts (zero logs, no cookie). Start Xvfb explicitly instead.

# 1. Clear any stale X locks/sockets/temp dirs
rm -f /tmp/.X*-lock
rm -rf /tmp/.X11-unix/* /tmp/xvfb-run.* 2>/dev/null || true

# 2. Start Xvfb on a fixed display
Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp -ac &
XVFB_PID=$!

# 3. Wait until the display is genuinely connectable (not a blind sleep)
for i in $(seq 1 30); do
  if xdpyinfo -display :99 >/dev/null 2>&1; then
    echo "[entrypoint] Xvfb :99 ready (pid $XVFB_PID)"
    break
  fi
  sleep 0.5
done

export DISPLAY=:99

# 4. exec so Python is PID 1: logs flow, crashes restart the container
exec python -u minter.py
