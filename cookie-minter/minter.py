"""Mints the qidian.com w_tsfp anti-bot cookie into Redis on a loop.

w_tsfp lasts ~20 min and is not refreshed by use, so we re-mint every
~12 min (or immediately when a worker sets the remint flag).

Tencent's probe.js fingerprints the browser. Bundled headless Chromium is
detected and issued an invalid token; real Google Chrome (channel="chrome")
running headed (Xvfb in the container) with light stealth passes. The
`x-waf-captcha-referer` cookie is set either way and is NOT a failure signal
on its own — so every minted token is verified with a real request before
it is stored.
"""
import os
import json
import time
import logging
import redis
import requests
from playwright.sync_api import sync_playwright

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("cookie-minter")

# MUST match scraper/services/qidian_cookie.py
QIDIAN_COOKIE_KEY = "qidian:cookie"
QIDIAN_REMINT_FLAG = "qidian:cookie:remint"
# MUST match scraper/services/proxy_manager.py PROXY_SET_KEY
PROXY_POOL_KEY = "scraper:proxies:pool"

REDIS_URL = os.environ["REDIS_URL"]
MINT_INTERVAL = int(os.environ.get("QIDIAN_MINT_INTERVAL", "720"))  # 12 min
POLL_GRANULARITY = 15  # seconds between remint-flag checks
TARGET_URL = "https://www.qidian.com/rank/"
# 玄鉴仙族 — known book, qidian id 1035420986. Used to verify a fresh token.
VALIDATE_URL = "https://www.qidian.com/so/%E7%8E%84%E9%89%B4%E4%BB%99%E6%97%8F.html"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
]
STEALTH_JS = (
    "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
    "window.chrome={runtime:{}};"
    "Object.defineProperty(navigator,'languages',{get:()=>['zh-CN','zh']});"
    "Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});"
)


def _random_proxy_parts(rconn):
    """Return (server, port, user, pass) from the shared pool, or None."""
    try:
        raw = rconn.srandmember(PROXY_POOL_KEY)
        if not raw:
            return None
        s = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)
        server, port, username, password = s.split(":")
        return server, port, username, password
    except Exception as e:
        logger.warning("Could not get/parse a proxy: %s", e)
        return None


def _playwright_proxy(parts):
    server, port, username, password = parts
    return {"server": f"http://{server}:{port}",
            "username": username, "password": password}


def _requests_proxies(parts):
    server, port, username, password = parts
    url = f"http://{username}:{password}@{server}:{port}"
    return {"http": url, "https": url}


def _validate(w_tsfp: str, rconn) -> bool:
    """Replay the token on a real search request (through a pool proxy — the
    exact path scraper workers use). Valid only if it returns real content."""
    parts = _random_proxy_parts(rconn)
    proxies = _requests_proxies(parts) if parts else None
    try:
        r = requests.get(
            VALIDATE_URL,
            headers={"User-Agent": UA, "Cookie": f"w_tsfp={w_tsfp}"},
            proxies=proxies, timeout=30,
        )
        return r.status_code == 200 and "data-bid" in r.text
    except Exception as e:
        logger.warning("Token validation request errored: %s", e)
        return False


def mint_once(rconn) -> bool:
    """Mint a w_tsfp with real Chrome, verify it works, then store it."""
    parts = _random_proxy_parts(rconn)
    if not parts:
        logger.warning("No proxies in '%s'; minting WITHOUT a proxy",
                       PROXY_POOL_KEY)

    w_tsfp = None
    csrf = ""
    cookies = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False, channel="chrome", args=LAUNCH_ARGS)
        try:
            # No user_agent override: real Chrome's own UA keeps the
            # fingerprint internally consistent for probe.js.
            ctx_kwargs = {"locale": "zh-CN",
                          "viewport": {"width": 1366, "height": 768}}
            if parts:
                ctx_kwargs["proxy"] = _playwright_proxy(parts)
                logger.info("Minting via proxy %s", ctx_kwargs["proxy"]["server"])
            ctx = browser.new_context(**ctx_kwargs)
            ctx.add_init_script(STEALTH_JS)
            page = ctx.new_page()
            # "commit" returns as soon as the response arrives — probe.js then
            # solves the challenge and *reloads* the page. We never touch the
            # DOM (that throws "Execution context was destroyed" mid-reload);
            # polling ctx.cookies() is navigation-safe.
            try:
                page.goto(TARGET_URL, wait_until="commit", timeout=60000)
            except Exception as e:
                logger.warning("goto interrupted (expected during probe.js "
                               "reload): %s", e)
            for _ in range(30):
                page.wait_for_timeout(1000)  # driver-side sleep
                cookies = {c["name"]: c["value"] for c in ctx.cookies()}
                if cookies.get("w_tsfp"):
                    page.wait_for_timeout(2500)  # let probe.js settle
                    cookies = {c["name"]: c["value"] for c in ctx.cookies()}
                    w_tsfp = cookies.get("w_tsfp")
                    csrf = cookies.get("_csrfToken") or ""
                    break
        finally:
            browser.close()

    if not w_tsfp:
        logger.warning("Mint failed: w_tsfp absent (cookies=%s)",
                       list(cookies.keys()))
        return False

    # The captcha cookie is NOT a failure signal — only validation is.
    if not _validate(w_tsfp, rconn):
        logger.warning("Minted w_tsfp failed validation "
                       "(probe.js fingerprint blocked); will retry")
        return False

    rconn.set(
        QIDIAN_COOKIE_KEY,
        json.dumps({"w_tsfp": w_tsfp, "_csrfToken": csrf,
                    "minted_at": time.time()}),
        ex=1500,
    )
    rconn.delete(QIDIAN_REMINT_FLAG)
    logger.info("Minted + validated w_tsfp (len=%d)", len(w_tsfp))
    return True


def main():
    rconn = redis.from_url(REDIS_URL)
    logger.info("cookie-minter started (interval=%ss, target=%s)",
                MINT_INTERVAL, TARGET_URL)
    last_mint = 0.0
    while True:
        due = (time.time() - last_mint) >= MINT_INTERVAL
        forced = rconn.exists(QIDIAN_REMINT_FLAG) == 1
        if due or forced:
            try:
                if mint_once(rconn):
                    last_mint = time.time()
                else:
                    time.sleep(30)  # transient failure backoff
                    continue
            except Exception:
                logger.exception("Mint crashed; retrying in 30s")
                time.sleep(30)
                continue
        time.sleep(POLL_GRANULARITY)


if __name__ == "__main__":
    main()
