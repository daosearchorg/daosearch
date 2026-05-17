"""Shared book-matching helpers.

- parse_qidian_search / pick_match / resolve_qidian_id : qq → qidian direction
  (our Chinese title+author -> qidian.com book id), used by the qidian mapper.
- search_qq_book : qidiantu -> qq direction, relocated from booklist_scraper
  (behavior unchanged) so both scrapers share one implementation.
"""
import re
import logging
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

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
