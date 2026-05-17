FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app
# Unbuffered stdout/stderr so logs stream live in Dokploy.
ENV PYTHONUNBUFFERED=1

# xdpyinfo (x11-utils) is used by entrypoint.sh to wait for Xvfb readiness.
RUN apt-get update && apt-get install -y --no-install-recommends x11-utils \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Real Google Chrome (channel="chrome") — probe.js detects bundled Chromium
# and issues an invalid token; real Chrome passes.
RUN playwright install chrome
COPY minter.py .
COPY entrypoint.sh /entrypoint.sh
# Strip any CRLF (file may be committed from Windows) so the shebang works,
# then make executable.
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

# Explicit Xvfb startup (xvfb-run hangs on stale X locks across container
# recreation, leaving PID 1 wedged and Python never started).
CMD ["/entrypoint.sh"]
