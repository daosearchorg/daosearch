"""Mints the qidian.com w_tsfp anti-bot cookie into Redis on a loop.

w_tsfp lasts ~20 min and is not refreshed by use, so we re-mint every
~12 min (or immediately when a worker sets the remint flag).
"""
import os
import json
import time
import logging
import redis
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
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


def _proxy_for_playwright(rconn):
    """Pull one proxy from the shared pool and shape it for Playwright.

    Datacenter IPs (like the Dokploy host) get qidian's hard captcha path;
    residential proxies get the auto-solvable probe.js path. w_tsfp is not
    IP-bound, so a cookie minted via a proxy works for all workers.
    Returns a playwright proxy dict, or None to mint directly.
    """
    try:
        raw = rconn.srandmember(PROXY_POOL_KEY)
        if not raw:
            logger.warning("No proxies in '%s'; minting WITHOUT a proxy "
                           "(datacenter IP may hit captcha)", PROXY_POOL_KEY)
            return None
        proxy_str = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)
        server, port, username, password = proxy_str.split(":")
        return {
            "server": f"http://{server}:{port}",
            "username": username,
            "password": password,
        }
    except Exception as e:
        logger.warning("Could not get/parse a proxy (%s); minting directly", e)
        return None


def mint_once(rconn) -> bool:
    """Solve probe.js in a headless browser and store the cookie. Returns success."""
    proxy = _proxy_for_playwright(rconn)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            ctx_kwargs = {"user_agent": UA, "locale": "zh-CN"}
            if proxy:
                ctx_kwargs["proxy"] = proxy
                logger.info("Minting via proxy %s", proxy["server"])
            ctx = browser.new_context(**ctx_kwargs)
            page = ctx.new_page()
            # "commit" returns as soon as the response arrives — probe.js then
            # solves the challenge and *reloads* the page. Querying the DOM
            # during that reload throws "Execution context was destroyed", so
            # we never touch the page: poll the context cookies, which is
            # navigation-safe.
            try:
                page.goto(TARGET_URL, wait_until="commit", timeout=60000)
            except Exception as e:
                logger.warning("goto interrupted (expected during probe.js reload): %s", e)

            # w_tsfp is the anti-bot token required for GET scraping;
            # _csrfToken only guards POST/API calls, which we never make,
            # so it is optional.
            w_tsfp = None
            csrf = ""
            cookies = {}
            for _ in range(30):
                page.wait_for_timeout(1000)  # driver-side sleep, not page-side
                cookies = {c["name"]: c["value"] for c in ctx.cookies()}
                if cookies.get("w_tsfp"):
                    # Let probe.js settle on its final token, then re-read.
                    page.wait_for_timeout(2000)
                    cookies = {c["name"]: c["value"] for c in ctx.cookies()}
                    w_tsfp = cookies.get("w_tsfp")
                    csrf = cookies.get("_csrfToken") or ""
                    break

            if "x-waf-captcha-referer" in cookies:
                logger.warning("WAF captcha cookie present — IP likely flagged; "
                               "minted w_tsfp may be rejected by qidian")
            if not w_tsfp:
                logger.warning("Mint failed: w_tsfp absent (cookies=%s)",
                               list(cookies.keys()))
                return False
            rconn.set(
                QIDIAN_COOKIE_KEY,
                json.dumps({"w_tsfp": w_tsfp, "_csrfToken": csrf,
                            "minted_at": time.time()}),
                ex=1500,
            )
            rconn.delete(QIDIAN_REMINT_FLAG)
            logger.info("Minted w_tsfp (len=%d)", len(w_tsfp))
            return True
        finally:
            browser.close()


def main():
    rconn = redis.from_url(REDIS_URL)
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
