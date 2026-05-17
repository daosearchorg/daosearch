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

REDIS_URL = os.environ["REDIS_URL"]
MINT_INTERVAL = int(os.environ.get("QIDIAN_MINT_INTERVAL", "720"))  # 12 min
POLL_GRANULARITY = 15  # seconds between remint-flag checks
TARGET_URL = "https://www.qidian.com/rank/"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


def mint_once(rconn) -> bool:
    """Solve probe.js in a headless browser and store the cookie. Returns success."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            ctx = browser.new_context(user_agent=UA, locale="zh-CN")
            page = ctx.new_page()
            page.goto(TARGET_URL, wait_until="domcontentloaded", timeout=60000)
            # probe.js runs and the page is re-served; give it time, then ensure
            # the real content (data-bid) is present.
            for _ in range(15):
                if page.locator("[data-bid]").count() > 0:
                    break
                page.wait_for_timeout(1000)
            cookies = {c["name"]: c["value"] for c in ctx.cookies()}
            w_tsfp = cookies.get("w_tsfp")
            csrf = cookies.get("_csrfToken")
            if not w_tsfp or not csrf:
                logger.warning("Mint failed: w_tsfp/_csrfToken absent (cookies=%s)",
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
