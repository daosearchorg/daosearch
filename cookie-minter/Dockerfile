FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app
# Unbuffered stdout/stderr so logs stream live in Dokploy (xvfb-run +
# Python block-buffering otherwise hides all output).
ENV PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Real Google Chrome (channel="chrome") — probe.js detects bundled Chromium
# and issues an invalid token; real Chrome passes.
RUN playwright install chrome
COPY minter.py .

# headless=False is required to beat probe.js fingerprinting, so run the
# browser under a virtual display (Xvfb ships in the Playwright image).
CMD ["xvfb-run", "-a", "python", "-u", "minter.py"]
