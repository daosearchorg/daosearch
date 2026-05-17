# QQ ↔ Qidian Book ID Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `books.qidian_id` for every book.qq.com book in our DB by resolving its Chinese title+author against `www.qidian.com`'s search, so we can later scrape booklists directly from Qidian and drop the qidiantu.com dependency.

**Architecture:** A dedicated Playwright **sidecar container** mints the short-lived (~20 min, non-rotating) `w_tsfp` anti-bot cookie into Redis on a ~12-min loop. Lightweight RQ workers stay `requests`-only: they read the shared cookie from Redis, hit `qidian.com/so/{title}.html` through rotating proxies, parse the SSR results, and match by exact title+author (fallback: title-only if the search returns a single title-exact result). A maintenance task backfills all titled books; a pipeline-friendly per-book RQ job keeps the map fresh.

**Tech Stack:** Python 3.11, RQ (Redis Queue), SQLAlchemy, BeautifulSoup+lxml, `requests`, Redis, Playwright (sidecar only), Docker Compose.

---

## Background / Verified Facts (do not re-investigate)

- `www.qidian.com/so/{urlencoded-title}.html` returns **server-side-rendered HTML** (no JSON API). Results are `<li class="res-book-item" data-bid="{qidian_id}" data-auid="{author_id}">` containing title, author, status. Result #1 (`data-rid="1"`) is the best match but is **not always correct** (a title can match as an *author* in another row), so author must be checked.
- Without the cookie, requests get `202` + a `probe.js` JS challenge (209-byte body). A real browser executes `probe.js` and is issued a `w_tsfp` cookie; replaying that cookie with plain `requests` returns `200` + real HTML.
- `w_tsfp` is **NOT IP-bound** (one cookie works across all proxies) and is **NOT refreshed** on successful responses (`Set-Cookie` empty). Hard lifetime ≈ **20 minutes** from mint.
- Qidian's `data-bid` is the **same ID space** as `qidiantu.com/info/{id}` and `qidian.com/book/{id}/`, so it goes straight into the existing `books.qidian_id` column.
- `books.qidian_id` is `Integer, nullable, UNIQUE`. Two qq books resolving to the same qidian_id WILL violate the constraint — must be handled, not crashed.
- The codebase has **no pytest infrastructure** (no pytest dep; `scraper/tests/` only holds `staging_tests.py` + fixtures). Per writing-plans "follow established patterns", tests in this plan are **standalone assert scripts run with the project venv** (`.venv/Scripts/python.exe path/to/test.py` locally, `python path/to/test.py` in container), mirroring `staging_tests.py`. Parser tests use an embedded HTML fixture (deterministic, no network); a separate live smoke script exercises the network path.

---

## File Structure

**New files:**
- `cookie-minter/minter.py` — Playwright loop: mint `w_tsfp`+`_csrfToken` → Redis. Sidecar only.
- `cookie-minter/Dockerfile` — Playwright base image.
- `cookie-minter/requirements.txt` — `redis`, `playwright`.
- `scraper/services/qidian_cookie.py` — Redis cookie store accessor (read/write/remint-flag). Pure Redis, no Playwright. Used by workers AND by the minter (minter imports nothing from scraper; it has its own copy of the key constants — see Task 2).
- `scraper/services/book_matcher.py` — shared matching module: `search_qidian()`, `resolve_qidian_id()`, and the relocated `search_qq_book()`.
- `scraper/workers/qidian_mapper.py` — RQ job `map_book_qidian_id(book_id)`.
- `scraper/tests/test_book_matcher.py` — deterministic parser test (embedded fixture).
- `scraper/tests/smoke_qidian_mapping.py` — live network smoke (manual).

**Modified files:**
- `scraper/spiders/booklist_scraper.py` — `_search_qq_book` delegates to `book_matcher` (behavior unchanged).
- `scraper/services/queue_manager.py` — add `scraper-mapping` queue + bulk enqueue + registry maps.
- `scraper/workers/maintenance.py` — add `check_unmapped_qidian_ids`.
- `scraper/services/auto_scheduler.py` — schedule the backfill task.
- `scraper/worker_pool.py` — add `scraper-mapping` to the `scraper` worker queue list.
- `scraper/main.py` — import + CLI task `map-qidian-ids`.
- `docker-compose.local.yml` — add `cookie-minter` service.

**Constants (single source of truth, defined in `scraper/services/qidian_cookie.py`):**
- `QIDIAN_COOKIE_KEY = "qidian:cookie"` — Redis string, JSON `{"w_tsfp": str, "_csrfToken": str, "minted_at": float}`.
- `QIDIAN_REMINT_FLAG = "qidian:cookie:remint"` — Redis key; presence = "mint now".
- `COOKIE_MAX_AGE_SECONDS = 1080` — 18 min; workers treat older/missing as unusable.

---

## Task 1: Redis cookie store accessor

**Files:**
- Create: `scraper/services/qidian_cookie.py`
- Test: `scraper/tests/test_qidian_cookie.py`

- [ ] **Step 1: Write the failing test**

Create `scraper/tests/test_qidian_cookie.py`:

```python
"""Run: .venv/Scripts/python.exe tests/test_qidian_cookie.py  (cwd = scraper/)

Uses an inline fake (no fakeredis dep) so the scraper image's
`uv sync --frozen` stays valid — zero new dependencies."""
import sys, time
sys.path.insert(0, ".")
from services import qidian_cookie as qc


class FakeRedis:
    """Minimal in-process stand-in for the redis methods we use."""
    def __init__(self):
        self._d = {}
    def set(self, k, v, ex=None):       # ex ignored — not under test
        self._d[k] = v
    def get(self, k):
        return self._d.get(k)
    def delete(self, k):
        self._d.pop(k, None)
    def exists(self, k):
        return 1 if k in self._d else 0


def test_roundtrip_and_age():
    r = FakeRedis()
    assert qc.get_cookie(r) is None  # empty store

    qc.set_cookie(r, "WTSFP_VALUE", "CSRF_VALUE")
    c = qc.get_cookie(r)
    assert c is not None
    assert c["w_tsfp"] == "WTSFP_VALUE"
    assert c["_csrfToken"] == "CSRF_VALUE"
    assert qc.cookie_header(c) == "_csrfToken=CSRF_VALUE; w_tsfp=WTSFP_VALUE"

    # stale detection
    c["minted_at"] = time.time() - (qc.COOKIE_MAX_AGE_SECONDS + 10)
    assert qc.is_stale(c) is True
    fresh = {"w_tsfp": "x", "_csrfToken": "y", "minted_at": time.time()}
    assert qc.is_stale(fresh) is False


def test_remint_flag():
    r = FakeRedis()
    assert qc.remint_requested(r) is False
    qc.request_remint(r)
    assert qc.remint_requested(r) is True
    qc.clear_remint(r)
    assert qc.remint_requested(r) is False


if __name__ == "__main__":
    test_roundtrip_and_age()
    test_remint_flag()
    print("OK test_qidian_cookie")
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `scraper/`): `.venv/Scripts/python.exe tests/test_qidian_cookie.py`
Expected: FAIL with `ModuleNotFoundError: No module named 'services.qidian_cookie'`.

- [ ] **Step 3: Write minimal implementation**

Create `scraper/services/qidian_cookie.py`:

```python
"""Redis-backed store for the qidian.com w_tsfp anti-bot cookie.

The cookie is minted by the cookie-minter sidecar (Playwright) and consumed
by requests-based workers. Not IP-bound; ~20 min hard lifetime, not rotated.
"""
import json
import time
import logging

logger = logging.getLogger(__name__)

QIDIAN_COOKIE_KEY = "qidian:cookie"
QIDIAN_REMINT_FLAG = "qidian:cookie:remint"
COOKIE_MAX_AGE_SECONDS = 1080  # 18 min — workers refuse older cookies


def set_cookie(redis_client, w_tsfp: str, csrf_token: str) -> None:
    payload = json.dumps({
        "w_tsfp": w_tsfp,
        "_csrfToken": csrf_token,
        "minted_at": time.time(),
    })
    # Expire the key a bit past the hard lifetime so a dead minter is obvious.
    redis_client.set(QIDIAN_COOKIE_KEY, payload, ex=1500)


def get_cookie(redis_client) -> dict | None:
    raw = redis_client.get(QIDIAN_COOKIE_KEY)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        logger.warning("Corrupt qidian cookie payload in Redis")
        return None


def is_stale(cookie: dict | None) -> bool:
    if not cookie or "minted_at" not in cookie:
        return True
    return (time.time() - cookie["minted_at"]) > COOKIE_MAX_AGE_SECONDS


def cookie_header(cookie: dict) -> str:
    """Cookie header string in a stable order."""
    return f"_csrfToken={cookie['_csrfToken']}; w_tsfp={cookie['w_tsfp']}"


def request_remint(redis_client) -> None:
    redis_client.set(QIDIAN_REMINT_FLAG, "1", ex=300)


def remint_requested(redis_client) -> bool:
    return redis_client.exists(QIDIAN_REMINT_FLAG) == 1


def clear_remint(redis_client) -> None:
    redis_client.delete(QIDIAN_REMINT_FLAG)
```

- [ ] **Step 4: Run test to verify it passes**

Run (cwd `scraper/`): `.venv/Scripts/python.exe tests/test_qidian_cookie.py`
Expected: `OK test_qidian_cookie`

- [ ] **Step 5: Commit**

```bash
git add scraper/services/qidian_cookie.py scraper/tests/test_qidian_cookie.py
git commit -m "feat(scraper): redis-backed qidian w_tsfp cookie store"
```

---

## Task 2: Cookie-minter sidecar

**Files:**
- Create: `cookie-minter/minter.py`
- Create: `cookie-minter/Dockerfile`
- Create: `cookie-minter/requirements.txt`

> The sidecar must not import from `scraper/` (separate build context). It re-declares the three Redis constants locally; they MUST stay identical to `scraper/services/qidian_cookie.py`. A guard test (Step 5) asserts they match.

- [ ] **Step 1: Write `cookie-minter/requirements.txt`**

```
redis>=5.0.0
playwright==1.48.0
```

- [ ] **Step 2: Write `cookie-minter/minter.py`**

```python
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
```

- [ ] **Step 3: Write `cookie-minter/Dockerfile`**

```dockerfile
FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY minter.py .

CMD ["python", "minter.py"]
```

- [ ] **Step 4: Write the constants-parity guard test**

Create `scraper/tests/test_minter_constants.py`:

```python
"""Run: .venv/Scripts/python.exe tests/test_minter_constants.py  (cwd = scraper/)"""
import re
import sys
import pathlib
sys.path.insert(0, ".")
from services import qidian_cookie as qc

minter_src = (pathlib.Path("..") / "cookie-minter" / "minter.py").read_text(encoding="utf-8")


def _literal(name: str) -> str:
    m = re.search(rf'^{name}\s*=\s*"([^"]+)"', minter_src, re.M)
    assert m, f"{name} not found in minter.py"
    return m.group(1)


def test_keys_match():
    assert _literal("QIDIAN_COOKIE_KEY") == qc.QIDIAN_COOKIE_KEY
    assert _literal("QIDIAN_REMINT_FLAG") == qc.QIDIAN_REMINT_FLAG


if __name__ == "__main__":
    test_keys_match()
    print("OK test_minter_constants")
```

- [ ] **Step 5: Run the guard test**

Run (cwd `scraper/`): `.venv/Scripts/python.exe tests/test_minter_constants.py`
Expected: `OK test_minter_constants`

- [ ] **Step 6: Commit**

```bash
git add cookie-minter/ scraper/tests/test_minter_constants.py
git commit -m "feat(cookie-minter): playwright sidecar that mints qidian w_tsfp to redis"
```

---

## Task 3: Shared book matcher — qidian search + parse

**Files:**
- Create: `scraper/services/book_matcher.py`
- Test: `scraper/tests/test_book_matcher.py`

- [ ] **Step 1: Write the failing parser test (deterministic, embedded fixture)**

Create `scraper/tests/test_book_matcher.py`:

```python
"""Run: .venv/Scripts/python.exe tests/test_book_matcher.py  (cwd = scraper/)"""
import sys
sys.path.insert(0, ".")
from services import book_matcher as bm

# Minimal fixture mirroring the real www.qidian.com/so/ result structure.
FIXTURE = """
<html><body>
<div class="book-img-text"><ul>
  <li class="res-book-item" data-bid="1014180485" data-rid="1" data-auid="4374001">
    <div class="book-mid-info">
      <h3 class="book-info-title"><a href="//www.qidian.com/book/1014180485/" target="_blank">天启预报</a></h3>
      <p class="author"><a class="name" href="//my.qidian.com/author/4374001/">风月</a>
        <span>完结</span></p>
    </div>
  </li>
  <li class="res-book-item" data-bid="1019781008" data-rid="2" data-auid="999">
    <div class="book-mid-info">
      <h3 class="book-info-title"><a href="//www.qidian.com/book/1019781008/" target="_blank">从一根草开始穿越</a></h3>
      <p class="author"><a class="name" href="//my.qidian.com/author/999/">天启预报</a>
        <span>连载</span></p>
    </div>
  </li>
</ul></div>
</body></html>
"""

SINGLE_TITLE_FIXTURE = """
<html><body><ul>
  <li class="res-book-item" data-bid="555" data-rid="1" data-auid="1">
    <div class="book-mid-info">
      <h3 class="book-info-title"><a href="//www.qidian.com/book/555/">独一无二的书</a></h3>
      <p class="author"><a class="name" href="//my.qidian.com/author/1/">某作者</a><span>连载</span></p>
    </div>
  </li>
</ul></body></html>
"""


def test_parse_results():
    rows = bm.parse_qidian_search(FIXTURE)
    assert len(rows) == 2
    assert rows[0] == {"bid": 1014180485, "title": "天启预报", "author": "风月", "status": "完结"}
    assert rows[1]["title"] == "从一根草开始穿越"
    assert rows[1]["author"] == "天启预报"  # title-as-author trap row


def test_match_exact_title_and_author():
    rows = bm.parse_qidian_search(FIXTURE)
    # Exact title+author wins, ignoring the trap row where the title appears as author.
    assert bm.pick_match(rows, "天启预报", "风月") == 1014180485
    # Title matches row 1 but author mismatches and >1 result → no confident match.
    assert bm.pick_match(rows, "天启预报", "不存在的作者") is None
    # No author known, multiple results → ambiguous → None.
    assert bm.pick_match(rows, "天启预报", None) is None


def test_title_only_fallback_single_result():
    rows = bm.parse_qidian_search(SINGLE_TITLE_FIXTURE)
    # Exactly one title-exact result and author unknown/mismatch → accept it.
    assert bm.pick_match(rows, "独一无二的书", None) == 555
    assert bm.pick_match(rows, "独一无二的书", "作者写错了") == 555
    # Title not present at all → None.
    assert bm.pick_match(rows, "不存在", None) is None


if __name__ == "__main__":
    test_parse_results()
    test_match_exact_title_and_author()
    test_title_only_fallback_single_result()
    print("OK test_book_matcher")
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `scraper/`): `.venv/Scripts/python.exe tests/test_book_matcher.py`
Expected: FAIL with `ModuleNotFoundError: No module named 'services.book_matcher'`.

- [ ] **Step 3: Write minimal implementation**

Create `scraper/services/book_matcher.py`:

```python
"""Shared book-matching helpers.

- parse_qidian_search / pick_match / resolve_qidian_id : qq → qidian direction
  (our Chinese title+author -> qidian.com book id), used by the qidian mapper.
- search_qq_book : qidiantu -> qq direction, relocated from booklist_scraper
  (behavior unchanged) so both scrapers share one implementation.
"""
import re
import logging
import random
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

from core.config import config
from services import qidian_cookie

logger = logging.getLogger(__name__)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


class CookieUnavailable(Exception):
    """Raised when no usable qidian cookie is in Redis (caller should retry later)."""


class ChallengeBlocked(Exception):
    """Raised when qidian served the probe.js challenge (cookie stale/invalid)."""


# --------------------------------------------------------------------------
# qq -> qidian : parse + match
# --------------------------------------------------------------------------

def parse_qidian_search(html: str) -> list[dict]:
    """Parse www.qidian.com/so/ SSR results into [{bid,title,author,status}]."""
    soup = BeautifulSoup(html, "lxml")
    out: list[dict] = []
    seen: set[int] = set()
    for li in soup.select("li.res-book-item"):
        raw_bid = li.get("data-bid")
        if not raw_bid or not raw_bid.isdigit():
            continue
        bid = int(raw_bid)
        if bid in seen:
            continue
        tnode = li.select_one(
            "h3.book-info-title a, .book-mid-info h2 a, h3 a")
        anode = li.select_one("p.author a.name, a.name, .author a")
        snode = li.select_one("p.author span, .author span")
        title = tnode.get_text(strip=True) if tnode else None
        if not title:
            continue
        out.append({
            "bid": bid,
            "title": title,
            "author": anode.get_text(strip=True) if anode else None,
            "status": snode.get_text(strip=True) if snode else None,
        })
        seen.add(bid)
    return out


def pick_match(rows: list[dict], title: str, author: str | None) -> int | None:
    """Decision rule:
      1. exact title AND exact author -> that bid
      2. else if exactly ONE row has exact title -> that bid (title-only fallback)
      3. else None
    """
    if not title:
        return None
    title_hits = [r for r in rows if r["title"] == title]
    if author:
        for r in title_hits:
            if r["author"] == author:
                return r["bid"]
    if len(title_hits) == 1:
        return title_hits[0]["bid"]
    return None


def _qidian_session(redis_client, proxy_manager) -> requests.Session:
    cookie = qidian_cookie.get_cookie(redis_client)
    if not cookie or qidian_cookie.is_stale(cookie):
        qidian_cookie.request_remint(redis_client)
        raise CookieUnavailable("No fresh qidian cookie available")
    s = requests.Session()
    s.headers.update({
        "User-Agent": UA,
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cookie": qidian_cookie.cookie_header(cookie),
        "Referer": "https://www.qidian.com/",
    })
    try:
        proxy_str = proxy_manager.get_next_proxy()
        s.proxies.update(proxy_manager.format_proxy_for_requests(proxy_str))
    except Exception as e:
        logger.warning("No proxy available for qidian search: %s", e)
    return s


def resolve_qidian_id(redis_client, proxy_manager, title: str,
                      author: str | None, timeout: int = 30) -> int | None:
    """Search qidian for `title`, return matched qidian book id or None.

    Raises CookieUnavailable / ChallengeBlocked so the caller can retry later.
    """
    if not title:
        return None
    url = f"https://www.qidian.com/so/{quote(title)}.html"
    session = _qidian_session(redis_client, proxy_manager)
    resp = session.get(url, timeout=timeout)
    if resp.status_code == 202 or "probe.js" in resp.text[:500]:
        qidian_cookie.request_remint(redis_client)
        raise ChallengeBlocked("qidian served probe.js challenge")
    resp.raise_for_status()
    rows = parse_qidian_search(resp.text)
    return pick_match(rows, title, author)


# --------------------------------------------------------------------------
# qidiantu -> qq  (relocated from booklist_scraper, behavior unchanged)
# --------------------------------------------------------------------------

def search_qq_book(qq_session, title: str) -> str | None:
    """Search book.qq.com/so/{title} and return the bid of an exact title match.

    Moved verbatim from spiders.booklist_scraper.QidiantuBooklistScraper.
    `qq_session` is a proxied requests.Session supplied by the caller.
    """
    try:
        encoded_title = quote(title)
        url = f"https://book.qq.com/so/{encoded_title}"
        resp = qq_session.get(url, timeout=30)
        resp.raise_for_status()

        nuxt_match = re.search(
            r'window\.__NUXT__\s*=\s*(.+?);\s*</script>', resp.text, re.DOTALL)
        if not nuxt_match:
            return None
        nuxt_text = nuxt_match.group(1)

        for bid_match in re.finditer(r'\bbid:(\d+)', nuxt_text):
            bid = bid_match.group(1)
            after = nuxt_text[bid_match.end():bid_match.end() + 500]
            title_match = re.search(r'\btitle:(["\'])(.+?)\1', after)
            if not title_match:
                title_var_match = re.search(r'\btitle:([a-z])\b', after)
                if title_var_match:
                    logger.info(
                        "Found bid %s with variable title (assuming match for '%s')",
                        bid, title)
                    return bid
                continue
            if title_match.group(2) == title:
                logger.info("Found exact match on qq.com: '%s' -> bid %s", title, bid)
                return bid
        return None
    except Exception as e:
        logger.warning("qq.com search failed for '%s': %s", title, e)
        return None
```

- [ ] **Step 4: Run test to verify it passes**

Run (cwd `scraper/`): `.venv/Scripts/python.exe tests/test_book_matcher.py`
Expected: `OK test_book_matcher`

- [ ] **Step 5: Commit**

```bash
git add scraper/services/book_matcher.py scraper/tests/test_book_matcher.py
git commit -m "feat(scraper): shared book_matcher (qidian search/match + relocated qq search)"
```

---

## Task 4: Point booklist_scraper at the shared qq search (no behavior change)

**Files:**
- Modify: `scraper/spiders/booklist_scraper.py` (the `_search_qq_book` method, ~lines 603-652)

- [ ] **Step 1: Replace the method body with a delegating call**

In `scraper/spiders/booklist_scraper.py`, replace the entire `_search_qq_book` method (from `def _search_qq_book(self, title: str) -> Optional[str]:` through its final `return None` / `except` block) with:

```python
    def _search_qq_book(self, title: str) -> Optional[str]:
        """Search book.qq.com for an exact title match. Delegates to the shared
        implementation in services.book_matcher (behavior unchanged)."""
        from services.book_matcher import search_qq_book
        return search_qq_book(self._get_qq_session(), title)
```

- [ ] **Step 2: Verify the import is no longer dead and module still imports**

Run (cwd `scraper/`): `.venv/Scripts/python.exe -c "import spiders.booklist_scraper as b; s=b.QidiantuBooklistScraper; print('import ok', hasattr(s,'_search_qq_book'))"`
Expected: `import ok True`

- [ ] **Step 3: Behavior-equivalence smoke (manual, network)**

Run (cwd `scraper/`):
`.venv/Scripts/python.exe -c "from spiders.booklist_scraper import QidiantuBooklistScraper as Q; q=Q(); print(q._search_qq_book('玄鉴仙族'))"`
Expected: prints a numeric bid string or `None` (no traceback). This confirms the delegation wiring works against the live site.

- [ ] **Step 4: Commit**

```bash
git add scraper/spiders/booklist_scraper.py
git commit -m "refactor(scraper): booklist_scraper uses shared search_qq_book"
```

---

## Task 5: Mapper RQ worker

**Files:**
- Create: `scraper/workers/qidian_mapper.py`
- Test: `scraper/tests/test_qidian_mapper_logic.py`

- [ ] **Step 1: Write the failing test (collision + skip logic, no network)**

Create `scraper/tests/test_qidian_mapper_logic.py`:

```python
"""Run: .venv/Scripts/python.exe tests/test_qidian_mapper_logic.py  (cwd = scraper/)"""
import sys
sys.path.insert(0, ".")
from workers.qidian_mapper import decide_assignment


def test_decide_assignment():
    # No qid resolved -> nothing to do.
    assert decide_assignment(resolved_qid=None, owner_book_id=None,
                              this_book_id=10) == ("none", None)
    # qid free -> assign.
    assert decide_assignment(resolved_qid=777, owner_book_id=None,
                              this_book_id=10) == ("assign", 777)
    # qid already owned by THIS book -> idempotent no-op.
    assert decide_assignment(resolved_qid=777, owner_book_id=10,
                             this_book_id=10) == ("noop", 777)
    # qid owned by ANOTHER book -> conflict, never steal.
    assert decide_assignment(resolved_qid=777, owner_book_id=99,
                              this_book_id=10) == ("conflict", 777)


if __name__ == "__main__":
    test_decide_assignment()
    print("OK test_qidian_mapper_logic")
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `scraper/`): `.venv/Scripts/python.exe tests/test_qidian_mapper_logic.py`
Expected: FAIL with `ModuleNotFoundError: No module named 'workers.qidian_mapper'`.

- [ ] **Step 3: Write minimal implementation**

Create `scraper/workers/qidian_mapper.py`:

```python
"""RQ worker: resolve and store books.qidian_id for a single book."""
import logging

import redis

from core.config import config
from core.database import db_manager
from core.models import Book
from services.book_matcher import (
    resolve_qidian_id, CookieUnavailable, ChallengeBlocked)
from services.proxy_manager import RedisProxyManager

logger = logging.getLogger(__name__)


def decide_assignment(resolved_qid, owner_book_id, this_book_id):
    """Pure decision helper (unit-tested).

    owner_book_id = id of the book that currently has resolved_qid, or None.
    Returns (action, qid) where action in {none, assign, noop, conflict}.
    """
    if resolved_qid is None:
        return ("none", None)
    if owner_book_id is None:
        return ("assign", resolved_qid)
    if owner_book_id == this_book_id:
        return ("noop", resolved_qid)
    return ("conflict", resolved_qid)


def map_book_qidian_id(book_id: int) -> dict:
    """Resolve a qidian book id for `book_id` and store it.

    Raises (so RQ retries later) when the cookie is stale/challenged — by then
    the minter will have refreshed it.
    """
    rconn = redis.from_url(config.redis["url"])
    pm = RedisProxyManager()

    with db_manager.get_session() as session:
        book = session.query(Book).filter(Book.id == book_id).first()
        if not book:
            return {"book_id": book_id, "result": "book_not_found"}
        if book.qidian_id is not None:
            return {"book_id": book_id, "result": "already_mapped",
                    "qidian_id": book.qidian_id}
        if not book.title:
            return {"book_id": book_id, "result": "no_title"}
        title, author = book.title, book.author

    # Network call outside the DB session.
    qid = resolve_qidian_id(rconn, pm, title, author)

    with db_manager.get_session() as session:
        book = session.query(Book).filter(Book.id == book_id).first()
        if not book or book.qidian_id is not None:
            return {"book_id": book_id, "result": "raced_or_gone"}
        owner = None
        if qid is not None:
            owner_row = session.query(Book.id).filter(
                Book.qidian_id == qid).first()
            owner = owner_row.id if owner_row else None
        action, q = decide_assignment(qid, owner, book_id)
        if action == "assign":
            book.qidian_id = q
            book.qidiantu_url = f"https://www.qidiantu.com/info/{q}"
            session.commit()
            logger.info("Mapped book %s -> qidian_id %s", book_id, q)
            return {"book_id": book_id, "result": "mapped", "qidian_id": q}
        if action == "conflict":
            logger.warning(
                "qidian_id %s for book %s already owned by book %s; skipping",
                q, book_id, owner)
            return {"book_id": book_id, "result": "conflict",
                    "qidian_id": q, "owner": owner}
        if action == "noop":
            return {"book_id": book_id, "result": "noop", "qidian_id": q}
        return {"book_id": book_id, "result": "no_match"}
```

> Note: `CookieUnavailable` / `ChallengeBlocked` are intentionally NOT caught — they propagate so RQ's `Retry` re-runs the job after the minter refreshes the cookie.

- [ ] **Step 4: Run test to verify it passes**

Run (cwd `scraper/`): `.venv/Scripts/python.exe tests/test_qidian_mapper_logic.py`
Expected: `OK test_qidian_mapper_logic`

- [ ] **Step 5: Commit**

```bash
git add scraper/workers/qidian_mapper.py scraper/tests/test_qidian_mapper_logic.py
git commit -m "feat(scraper): qidian_mapper RQ worker with collision-safe assignment"
```

---

## Task 6: Queue wiring (`scraper-mapping` queue)

**Files:**
- Modify: `scraper/services/queue_manager.py`

- [ ] **Step 1: Add the queue object**

In `scraper/services/queue_manager.py` `__init__`, immediately after the line
`self.scraper_comments_queue = Queue('scraper-comments', connection=self.redis)`
add:

```python
        self.scraper_mapping_queue = Queue('scraper-mapping', connection=self.redis)
```

- [ ] **Step 2: Add the bulk enqueue method**

In the same file, immediately after the `add_chart_scrape_jobs_bulk` method, add:

```python
    def add_qidian_map_jobs_bulk(self, book_ids: list[int]) -> int:
        """Bulk enqueue qidian-id mapping jobs."""
        if not book_ids:
            return 0

        job_data_list = [
            Queue.prepare_data(
                'workers.qidian_mapper.map_book_qidian_id',
                args=(book_id,),
                job_id=f"map_qidian_{book_id}",
                timeout='5m',
                result_ttl=60,
                failure_ttl=86400,
                retry=Retry(max=3)
            )
            for book_id in book_ids
        ]

        enqueued = self.scraper_mapping_queue.enqueue_many(job_data_list)
        return len(enqueued)
```

- [ ] **Step 3: Register the queue in `_all_scraper_queues`**

Replace the `_all_scraper_queues` property body with:

```python
    @property
    def _all_scraper_queues(self) -> list:
        return [self.scraper_charts_queue, self.scraper_books_queue,
                self.scraper_booklists_queue, self.scraper_comments_queue,
                self.scraper_mapping_queue]
```

- [ ] **Step 4: Add `'scraper-mapping'` to the three queue_map dicts**

In each of `is_job_in_queue`, `get_all_job_ids`, and `clear_failed_jobs`, add this entry to the `queue_map` dict (next to the `'scraper-comments'` entry):

```python
            'scraper-mapping': [self.scraper_mapping_queue],
```

- [ ] **Step 5: Add stats**

In `get_queue_stats`, add to the returned dict (after the `'scraper-comments'` line):

```python
            'scraper-mapping': self._queue_stats(self.scraper_mapping_queue),
```

- [ ] **Step 6: Verify it imports and the queue is wired**

Run (cwd `scraper/`):
`.venv/Scripts/python.exe -c "from services.queue_manager import QueueManager; q=QueueManager(); assert 'scraper-mapping' in q.get_queue_stats(); assert q.scraper_mapping_queue in q._all_scraper_queues; print('queue wired ok')"`
Expected: `queue wired ok`

- [ ] **Step 7: Commit**

```bash
git add scraper/services/queue_manager.py
git commit -m "feat(scraper): scraper-mapping queue + bulk enqueue + registries"
```

---

## Task 7: Maintenance backfill task

**Files:**
- Modify: `scraper/workers/maintenance.py`

- [ ] **Step 1: Add the method to `MaintenanceWorker`**

In `scraper/workers/maintenance.py`, add this method to the `MaintenanceWorker` class (place it next to the other `check_*` methods; match the existing dedup pattern used by `check_missing_translations` — `get_all_job_ids` then filter then bulk-enqueue):

```python
    def check_unmapped_qidian_ids(self, limit: int = 10000) -> dict:
        """Enqueue qidian-id mapping for books that have a title but no qidian_id."""
        with db_manager.get_session() as session:
            rows = session.query(Book.id).filter(
                Book.title.isnot(None),
                Book.qidian_id.is_(None),
            ).limit(limit).all()
            book_ids = [r.id for r in rows]

        if not book_ids:
            logger.info("No unmapped qidian books to enqueue")
            return {"enqueued": 0, "candidates": 0}

        already = self.queue_manager.get_all_job_ids('scraper-mapping')
        to_enqueue = [
            bid for bid in book_ids
            if f"map_qidian_{bid}" not in already
        ]
        enqueued = self.queue_manager.add_qidian_map_jobs_bulk(to_enqueue)
        logger.info("Bulk enqueued %d qidian-map jobs (%d candidates)",
                    enqueued, len(book_ids))
        return {"enqueued": enqueued, "candidates": len(book_ids)}
```

- [ ] **Step 2: Add the module-level wrapper**

At the bottom of `scraper/workers/maintenance.py`, alongside the other module-level wrappers (e.g. `check_missing_translations`), add:

```python
def check_unmapped_qidian_ids(limit: int = 10000) -> dict:
    return MaintenanceWorker().check_unmapped_qidian_ids(limit)
```

> If `Book` is not already imported at module top in maintenance.py, confirm it is (it is used by other tasks like `check_missing_fields`). No new import needed.

- [ ] **Step 3: Verify import + callable**

Run (cwd `scraper/`):
`.venv/Scripts/python.exe -c "from workers.maintenance import check_unmapped_qidian_ids, MaintenanceWorker; assert hasattr(MaintenanceWorker,'check_unmapped_qidian_ids'); print('maintenance task ok')"`
Expected: `maintenance task ok`

- [ ] **Step 4: Dry-run the candidate query against production DB (count only, no enqueue)**

Run (cwd `scraper/`):
`.venv/Scripts/python.exe -c "from core.database import db_manager; from core.models import Book; s=db_manager.get_session().__enter__(); print('titled & unmapped:', s.query(Book.id).filter(Book.title.isnot(None), Book.qidian_id.is_(None)).limit(5).count())"`
Expected: prints a small integer (sanity that the filter runs; full count not needed).

- [ ] **Step 5: Commit**

```bash
git add scraper/workers/maintenance.py
git commit -m "feat(scraper): check_unmapped_qidian_ids backfill maintenance task"
```

---

## Task 8: Worker pool + scheduler + CLI wiring

**Files:**
- Modify: `scraper/worker_pool.py:21`
- Modify: `scraper/services/auto_scheduler.py` (last_runs dict + a scheduled block)
- Modify: `scraper/main.py` (import line + CLI task)

- [ ] **Step 1: Add the queue to the `scraper` worker (lowest priority)**

In `scraper/worker_pool.py`, change the `'scraper'` entry of `WORKER_QUEUES` (line 21) to append `'scraper-mapping'` LAST (so books/charts/comments drain first):

```python
    'scraper': ['scraper-charts', 'scraper-books', 'scraper-booklists', 'scraper-comments', 'scraper-mapping'],
```

- [ ] **Step 2: Register the scheduler bookkeeping key**

In `scraper/services/auto_scheduler.py`, add to the `self.last_runs` dict (in `__init__`):

```python
            'map_qidian_ids': 0,
```

- [ ] **Step 3: Add the scheduled block**

In `scraper/services/auto_scheduler.py` `_schedule_if_due`, add a block mirroring the existing 15-minute tasks (e.g. the `check_missing_translations` block at ~lines 58-65). Use a 15-minute interval:

```python
        # Qidian id mapping every 15 minutes
        if now - self.last_runs['map_qidian_ids'] >= 900:
            try:
                job_id = self.queue_manager.add_maintenance_job(
                    'check_unmapped_qidian_ids', limit=10000)
                self.last_runs['map_qidian_ids'] = now
                logger.info(f"Scheduled qidian id mapping task: {job_id}")
            except Exception as e:
                logger.error(f"Failed to schedule qidian id mapping task: {e}")
```

- [ ] **Step 4: Wire the CLI task**

In `scraper/main.py`, extend the existing maintenance import line (line 18) to also import `check_unmapped_qidian_ids`:

```python
from workers.maintenance import check_missing_fields, check_missing_translations, check_stale_books, check_missing_comments, check_untranslated_comments, check_untranslated_nicknames, refresh_qq_charts, refresh_qidian_booklists, check_booklist_missing_translations, check_unmapped_qidian_ids
```

Then, in the `run_maintenance` task dispatch (next to the `elif task_type == "booklist-missing-translations":` branch), add:

```python
            elif task_type == "map-qidian-ids":
                result = check_unmapped_qidian_ids(limit)
                print(f"✅ Qidian id mapping: {result}")
```

- [ ] **Step 5: Verify everything imports together**

Run (cwd `scraper/`):
`.venv/Scripts/python.exe -c "import main, worker_pool; from services.auto_scheduler import *; assert 'scraper-mapping' in worker_pool.WORKER_QUEUES['scraper']; print('wiring ok')"`
Expected: `wiring ok`

- [ ] **Step 6: Commit**

```bash
git add scraper/worker_pool.py scraper/services/auto_scheduler.py scraper/main.py
git commit -m "feat(scraper): schedule + CLI + worker-pool wiring for qidian mapping"
```

---

## Task 9: docker-compose sidecar

**Files:**
- Modify: `docker-compose.local.yml`

- [ ] **Step 1: Add the `cookie-minter` service**

In `docker-compose.local.yml`, add this service (place it just before the `reader:` service, following the existing indentation/style; note other services use `redis://redis:6379` internally):

```yaml
  # Cookie minter — Playwright sidecar that mints the qidian.com w_tsfp
  # anti-bot cookie into Redis (~12 min loop). Workers read it via Redis.
  cookie-minter:
    build:
      context: ./cookie-minter
      dockerfile: Dockerfile
    environment:
      - REDIS_URL=redis://redis:6379
      - QIDIAN_MINT_INTERVAL=720
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
    mem_limit: 1g
```

- [ ] **Step 2: Validate compose file**

Run (cwd repo root): `docker compose -f docker-compose.local.yml config --quiet && echo "compose valid"`
Expected: `compose valid` (no YAML/schema errors).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.local.yml
git commit -m "feat(infra): cookie-minter sidecar service in docker-compose"
```

---

## Task 10: End-to-end live smoke (manual gate before backfill)

**Files:**
- Create: `scraper/tests/smoke_qidian_mapping.py`

- [ ] **Step 1: Write the live smoke script**

Create `scraper/tests/smoke_qidian_mapping.py`:

```python
"""Manual live smoke. Requires a fresh cookie in Redis (minter running, or
seed one manually). Run: .venv/Scripts/python.exe tests/smoke_qidian_mapping.py
(cwd = scraper/). Does NOT write to the DB."""
import sys
sys.path.insert(0, ".")
import redis
from core.config import config
from services.proxy_manager import RedisProxyManager
from services import qidian_cookie
from services.book_matcher import resolve_qidian_id, parse_qidian_search

rconn = redis.from_url(config.redis["url"])
ck = qidian_cookie.get_cookie(rconn)
print("cookie present:", ck is not None, "stale:", qidian_cookie.is_stale(ck))
if not ck or qidian_cookie.is_stale(ck):
    print("No fresh cookie in Redis — start the cookie-minter first. Abort.")
    sys.exit(1)

pm = RedisProxyManager()
# Known-good: 玄鉴仙族 by 季越人 -> 1035420986
qid = resolve_qidian_id(rconn, pm, "玄鉴仙族", "季越人")
print("玄鉴仙族 / 季越人 ->", qid)
assert qid == 1035420986, f"expected 1035420986, got {qid}"

# Title-only fallback path: unique-ish title, wrong author.
qid2 = resolve_qidian_id(rconn, pm, "玄鉴仙族", "不存在作者")
print("玄鉴仙族 / wrong-author ->", qid2, "(fallback acceptable if single result)")

print("OK smoke_qidian_mapping")
```

- [ ] **Step 2: Build & start infra, seed the minter**

Run (cwd repo root):
```bash
docker compose -f docker-compose.local.yml up -d redis cookie-minter
```
Wait ~90s for the first mint, then verify the cookie landed:
Run (cwd `scraper/`):
`.venv/Scripts/python.exe -c "import redis;from core.config import config;from services import qidian_cookie as q;print(q.get_cookie(redis.from_url(config.redis['url'])) is not None)"`
Expected: `True` (cookie minted into Redis). If `False`, check `docker compose -f docker-compose.local.yml logs cookie-minter`.

- [ ] **Step 3: Run the live smoke**

Run (cwd `scraper/`): `.venv/Scripts/python.exe tests/smoke_qidian_mapping.py`
Expected: `玄鉴仙族 / 季越人 -> 1035420986` then `OK smoke_qidian_mapping` (no AssertionError).

- [ ] **Step 4: Single-book DB write check (one real book)**

Pick one titled, unmapped book id from production and run the actual worker function once:
Run (cwd `scraper/`):
```
.venv/Scripts/python.exe -c "from core.database import db_manager; from core.models import Book; s=db_manager.get_session().__enter__(); b=s.query(Book).filter(Book.title.isnot(None), Book.qidian_id.is_(None)).first(); print(b.id, b.title, b.author)"
```
Then:
```
.venv/Scripts/python.exe -c "from workers.qidian_mapper import map_book_qidian_id; print(map_book_qidian_id(<ID_FROM_ABOVE>))"
```
Expected: a dict with `result` in `{mapped, no_match, conflict}` (no traceback). If `mapped`, re-running it returns `already_mapped` (idempotency confirmed).

- [ ] **Step 5: Commit**

```bash
git add scraper/tests/smoke_qidian_mapping.py
git commit -m "test(scraper): live smoke for qidian mapping path"
```

---

## Task 11: Controlled backfill rollout

No code — operational gate. Do NOT enable the scheduler until the smoke (Task 10) passes.

- [ ] **Step 1: Validation batch (500 books)**

Run the maintenance task once with a small limit and watch results:
Run (cwd `scraper/`): `.venv/Scripts/python.exe main.py maintenance map-qidian-ids --limit 500` (use the actual maintenance CLI invocation form used by the project; see `main.py` arg parser).
Then start a `scraper` worker briefly and inspect `scraper-mapping` queue stats via `QueueManager().get_queue_stats()`. Measure: % `mapped` vs `no_match` vs `conflict` over the 500.

- [ ] **Step 2: Decision checkpoint**

Review the match rate and any `conflict` entries. If false-positive risk looks acceptable (the title-only fallback only fires on single-result searches by design), proceed. Otherwise tighten `pick_match` (e.g. drop the title-only fallback) and re-run Step 1.

- [ ] **Step 3: Enable continuous backfill**

Ensure `cookie-minter` is running, then start the auto-scheduler / scraper workers as normal. The 15-min `check_unmapped_qidian_ids` task will drain the ~850k titled books over time at lowest scraper-queue priority (won't starve book/comment scraping).

- [ ] **Step 4: Monitor**

Periodically check `SELECT count(*) FROM books WHERE title IS NOT NULL AND qidian_id IS NOT NULL;` climbing, and `scraper-mapping` failed-registry size (failures here are mostly transient cookie/proxy — RQ retries handle them).

---

## Self-Review

**Spec coverage:**
- qidian search feasibility / cookie infra → Tasks 1, 2, 10. ✓
- Match rule "exact title+author, fallback title-only if single result" → Task 3 `pick_match` + tests. ✓
- Backfill scope "only books with a title, skip empties" → Task 7 query `Book.title.isnot(None), Book.qidian_id.is_(None)`. ✓
- Cookie minter as **dedicated sidecar** (user choice) → Task 2 + Task 9. ✓
- Reuse booklist `_search_qq_book` precedent / drop duplication → Task 3 relocation + Task 4 delegation. ✓
- UNIQUE constraint collision handling → Task 5 `decide_assignment` (`conflict` never steals) + tests. ✓
- Pipeline-fresh mapping going forward → Task 7 maintenance + Task 8 scheduler (15-min cadence picks up newly-titled books). ✓
- Rankings explicitly OUT of scope (user deferred) → not in plan. ✓

**Placeholder scan:** No TBD/“add error handling”/“similar to Task N”. All code blocks complete; `<ID_FROM_ABOVE>` in Task 10 Step 4 is an explicit operator substitution, not a code placeholder.

**Type consistency:** `parse_qidian_search`/`pick_match`/`resolve_qidian_id`/`search_qq_book` (book_matcher) used consistently in Tasks 3-5. `decide_assignment` signature `(resolved_qid, owner_book_id, this_book_id)` and return tuples identical in Task 5 impl + test. Redis constants `QIDIAN_COOKIE_KEY`/`QIDIAN_REMINT_FLAG` defined once (Task 1), duplicated only in the sidecar with a parity guard test (Task 2). Queue id `map_qidian_{book_id}` consistent between Task 6 enqueue and Task 7 dedup.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-qq-qidian-id-mapping.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
