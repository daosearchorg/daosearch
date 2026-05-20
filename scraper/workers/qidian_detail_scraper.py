"""Qidian Book-Detail Scraper — fetches a single www.qidian.com book page
and enriches the matching Book row (qidian-native stubs that the charts /
booklist scrapers auto-inserted with only title+author+qidian_id+url).

Mirrors qidian_charts_scraper.py for cookie/proxy/retry; writes back to the
existing Book row matched by qidian_id. Leaves all qq_* fields untouched
(those belong to book.qq.com). Queues a translation job once Chinese
synopsis lands so synopsis_translated catches up automatically.
"""
import re
import time
import random
import logging
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

from core.config import config
from core.database import db_manager
from core.models import Book
from core.redis_conn import get_redis
from services import qidian_cookie
from services.proxy_manager import RedisProxyManager
from services.queue_manager import QueueManager

logger = logging.getLogger(__name__)

# Process-level singletons (per worker, not per job). Per-job instantiation
# opens unbounded redis pools -> ephemeral port exhaustion. Same pattern as
# qidian_charts_scraper.
_PM = None
_QM = None


def _proxy_manager():
    global _PM
    if _PM is None:
        _PM = RedisProxyManager(redis_client=get_redis())
    return _PM


def _queue_manager():
    global _QM
    if _QM is None:
        _QM = QueueManager(redis_client=get_redis())
    return _QM


UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")


def _fetch(url: str, rconn) -> str:
    """Fetch a qidian book page via the shared cookie + a rotating proxy.
    Raises on challenge/missing-cookie so RQ retries after the minter."""
    cookie = qidian_cookie.get_cookie(rconn)
    if not cookie or qidian_cookie.is_stale(cookie):
        qidian_cookie.request_remint(rconn)
        raise RuntimeError("No fresh qidian cookie; remint requested")

    pm = _proxy_manager()
    headers = {
        "User-Agent": UA,
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cookie": qidian_cookie.cookie_header(cookie),
        "Referer": "https://www.qidian.com/",
    }
    proxies = None
    try:
        proxies = pm.format_proxy_for_requests(pm.get_next_proxy())
    except Exception as e:
        logger.warning("No proxy for qidian detail fetch: %s", e)

    resp = requests.get(url, headers=headers, proxies=proxies,
                        timeout=config.crawler['request_timeout'],
                        allow_redirects=True)
    # 404 = book removed/hidden on qidian → mark dead at the call site.
    if resp.status_code == 404:
        return '__404__'
    if resp.status_code == 202 or "probe.js" in resp.text[:500]:
        qidian_cookie.request_remint(rconn)
        raise RuntimeError(f"qidian challenge on {url}; remint requested")
    resp.raise_for_status()
    return resp.text


# Word-count regex: matches "100万字", "1.5亿字", "5000字", etc. Anchored loosely
# so it works inside arbitrary surrounding text on the book-info panel.
_WORD_COUNT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(亿|万)?\s*字")


def _parse_word_count(text: str) -> int | None:
    m = _WORD_COUNT_RE.search(text)
    if not m:
        return None
    num = float(m.group(1))
    unit = m.group(2)
    if unit == '万':
        num *= 10_000
    elif unit == '亿':
        num *= 100_000_000
    return int(num)


def _parse_status(text: str) -> str | None:
    # Qidian status badges: "连载" (ongoing), "完本/完结/已完结" (completed).
    # Test completed first since "连载" can appear as a substring elsewhere.
    if any(token in text for token in ('完本', '已完结', '完结', '已完成')):
        return 'completed'
    if '连载' in text:
        return 'ongoing'
    return None


def parse_qidian_book_detail(html: str) -> dict:
    """Extract book detail fields from a www.qidian.com book page.
    Returns a partial dict — any field can be missing if the page changed
    layout or the selector didn't match. Caller decides what to write back."""
    soup = BeautifulSoup(html, "lxml")
    out: dict = {}

    # ---- Title -------------------------------------------------------------
    title_el = (
        soup.select_one("h1#bookName em")
        or soup.select_one("h1 em")
        or soup.select_one(".book-info h1 em")
        or soup.select_one(".book-information h1 em")
    )
    if title_el:
        title = title_el.get_text(strip=True)
        if title:
            out['title'] = title

    # ---- Author ------------------------------------------------------------
    author_el = (
        soup.select_one("h1#bookName a.writer-name")
        or soup.select_one("h1 a.writer-name")
        or soup.select_one(".book-info h1 a.writer")
        or soup.select_one(".book-information a.writer-name")
        or soup.select_one("h1 a.writer")
    )
    if author_el:
        author = author_el.get_text(strip=True)
        if author:
            out['author'] = author

    # ---- Cover image -------------------------------------------------------
    # Prefer og:image (set by qidian itself), fall back to the on-page <img>.
    og = soup.select_one('meta[property="og:image"]')
    img_url = og.get('content') if og and og.get('content') else None
    if not img_url:
        img_el = (
            soup.select_one('#bookImg img')
            or soup.select_one('.book-img img')
            or soup.select_one('.book-cover img')
        )
        if img_el and img_el.get('src'):
            img_url = img_el['src']
    if img_url:
        if img_url.startswith('//'):
            img_url = 'https:' + img_url
        out['image_url'] = img_url

    # ---- Synopsis ----------------------------------------------------------
    # Qidian typically shows the full intro at #book-intro-detail; the
    # short version sits in `meta[name=description]`. Prefer the full one.
    syn_el = (
        soup.select_one('#book-intro-detail')
        or soup.select_one('#book-intro p')
        or soup.select_one('.book-intro')
        or soup.select_one('.book-information .book-intro')
    )
    if syn_el:
        syn = syn_el.get_text('\n', strip=True)
        if syn:
            out['synopsis'] = syn
    if 'synopsis' not in out:
        meta_desc = soup.select_one('meta[name="description"]')
        if meta_desc and meta_desc.get('content'):
            desc = meta_desc['content'].strip()
            if desc:
                out['synopsis'] = desc

    # ---- Word count + status -----------------------------------------------
    # Both live in the .book-info panel near the author name. Pull all the
    # info-panel text once and pattern-match for the values we need.
    info_root = (
        soup.select_one('.book-info')
        or soup.select_one('.book-information')
        or soup.select_one('#bookInfo')
    )
    if info_root:
        info_text = info_root.get_text(' ', strip=True)
        wc = _parse_word_count(info_text)
        if wc is not None:
            out['word_count'] = wc
        status = _parse_status(info_text)
        if status:
            out['status'] = status

    return out


def scrape_qidian_book_detail(qidian_id: int) -> dict:
    """RQ worker entrypoint: fetch a qidian.com book page and fill in the
    missing fields on the existing Book row matched by qidian_id.

    No-ops if the book is already enriched (image_url + synopsis both set).
    Marks the row dead on a 404. Queues a translation job after a successful
    write so synopsis_translated catches up. Returns a status dict.
    """
    if not isinstance(qidian_id, int) or qidian_id <= 0:
        return {'success': False, 'error': f'invalid qidian_id: {qidian_id}'}

    url = f"https://www.qidian.com/book/{qidian_id}/"
    rconn = get_redis()
    logger.info("Scraping qidian book detail: %s", url)

    # Look up the target row up-front so we can early-exit on already-enriched
    # books without burning a fetch.
    with db_manager.get_session() as db:
        book = db.query(Book).filter(Book.qidian_id == qidian_id).first()
        if not book:
            logger.warning("No Book row with qidian_id=%s — skipping", qidian_id)
            return {'success': False, 'error': 'no book row',
                    'qidian_id': qidian_id}
        if book.dead:
            return {'success': True, 'qidian_id': qidian_id,
                    'message': 'already dead', 'updated': 0}
        if book.image_url and book.synopsis:
            return {'success': True, 'qidian_id': qidian_id,
                    'message': 'already enriched', 'updated': 0}
        book_id = book.id

    max_retries = 3
    for attempt in range(max_retries):
        try:
            html = _fetch(url, rconn)

            if html == '__404__':
                with db_manager.get_session() as db:
                    b = db.query(Book).filter(Book.id == book_id).first()
                    if b and not b.dead:
                        b.dead = True
                        b.last_scraped_at = datetime.now(timezone.utc)
                        db.commit()
                logger.info("qidian 404, marked dead: qidian_id=%s id=%s",
                            qidian_id, book_id)
                return {'success': True, 'qidian_id': qidian_id,
                        'book_id': book_id, 'dead': True, 'updated': 0}

            parsed = parse_qidian_book_detail(html)
            if not parsed:
                logger.warning("Empty parse for %s — page layout?", url)
                return {'success': False, 'qidian_id': qidian_id,
                        'error': 'empty parse'}

            now = datetime.now(timezone.utc)
            updated_fields: list[str] = []
            with db_manager.get_session() as db:
                b = db.query(Book).filter(Book.id == book_id).first()
                if not b:
                    return {'success': False,
                            'error': 'book disappeared mid-scrape',
                            'qidian_id': qidian_id}

                # Only fill NULL/empty fields. Title and author were already
                # set when the qidian charts/booklist scraper auto-inserted
                # the stub, and they're more reliable than re-parsed strings
                # so we don't overwrite them.
                if not b.title and parsed.get('title'):
                    b.title = parsed['title']
                    updated_fields.append('title')
                if not b.author and parsed.get('author'):
                    b.author = parsed['author']
                    updated_fields.append('author')
                if not b.image_url and parsed.get('image_url'):
                    b.image_url = parsed['image_url']
                    updated_fields.append('image_url')
                if not b.synopsis and parsed.get('synopsis'):
                    b.synopsis = parsed['synopsis']
                    updated_fields.append('synopsis')
                if b.word_count is None and parsed.get('word_count') is not None:
                    b.word_count = parsed['word_count']
                    updated_fields.append('word_count')
                if not b.status and parsed.get('status'):
                    b.status = parsed['status']
                    updated_fields.append('status')

                b.last_scraped_at = now
                db.commit()

            # Queue translation only if we wrote new translatable content.
            # The translation worker handles title/synopsis/author together.
            if any(f in updated_fields for f in ('title', 'author', 'synopsis')):
                try:
                    _queue_manager().add_translation_job(book_id, 'book')
                except Exception as e:
                    logger.warning("Failed to queue translation for %s: %s",
                                   book_id, e)

            logger.info("qidian detail %s: updated %s",
                        url, updated_fields or '<no-op>')
            return {'success': True, 'qidian_id': qidian_id,
                    'book_id': book_id, 'updated_fields': updated_fields,
                    'attempt': attempt + 1}

        except requests.RequestException as e:
            logger.warning("qidian detail request error (attempt %d): %s",
                           attempt + 1, e)
            if attempt < max_retries - 1:
                time.sleep(random.uniform(1.0, 3.0))
                continue
        except Exception as e:
            logger.error("qidian detail scrape error: %s", e)
            break

    return {'success': False, 'error': 'failed after all attempts',
            'qidian_id': qidian_id, 'attempts': max_retries}
