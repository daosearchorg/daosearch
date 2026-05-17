"""Qidian Charts Scraper — scrapes www.qidian.com leaderboards.

Distinct from charts_scraper.py (book.qq.com). Qidian rankings are pure
ordinal (no numeric score); each rank type IS the metric. Books are linked
via Book.qidian_id (same id space as the qidian mapper); unknown books are
auto-inserted as qidian-native so the rank is always complete.
"""
import time
import random
import logging
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

from core.config import config
from core.database import db_manager
from core.models import QidianChartEntry
from core.redis_conn import get_redis
from services import qidian_cookie
from services.book_matcher import resolve_book
from services.proxy_manager import RedisProxyManager
from services.queue_manager import QueueManager

logger = logging.getLogger(__name__)

# Process-level singletons (one per worker), bound to the shared Redis pool.
# Per-job instantiation opens unbounded pools -> ephemeral port exhaustion.
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

# Core 6 rank types (slug -> 中文 label, for reference/logging)
QIDIAN_RANK_TYPES = {
    'yuepiao': '月票榜',
    'hotsales': '畅销榜',
    'recom': '推荐榜',
    'collect': '收藏榜',
    'readindex': '阅读指数榜',
    'vipup': '更新榜',
}

# Genre channels: key -> qidian chanId (None = site-wide "overall").
QIDIAN_GENRE_CHANNELS = {
    'overall': None,
    'chn1': 1,      # 奇幻
    'chn2': 2,      # 武侠
    'chn4': 4,      # 都市
    'chn5': 5,      # 历史
    'chn6': 6,      # 军事
    'chn7': 7,      # 游戏
    'chn8': 8,      # 体育
    'chn9': 9,      # 科幻
    'chn10': 10,    # 悬疑灵异
    'chn12': 12,    # 轻小说
    'chn15': 15,    # 现实
    'chn21': 21,    # 玄幻
    'chn22': 22,    # 仙侠
    'chn20109': 20109,  # 诸天无限
}

QIDIAN_CHART_PAGES = [1, 2, 3, 4, 5]
# qidian.com shows 20 books per rank page; used to make `position`
# continuous across pages (the scraped data-rid resets 1-20 per page).
QIDIAN_PER_PAGE = 20

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")


def build_qidian_chart_url(rank_type: str, genre_channel: str, page: int) -> str:
    """
      overall p1: https://www.qidian.com/rank/{type}/
      overall pN: https://www.qidian.com/rank/{type}/page{N}/
      chnX   p1 : https://www.qidian.com/rank/{type}/chnX/
      chnX   pN : https://www.qidian.com/rank/{type}/chnX/page{N}/
    """
    base = f"https://www.qidian.com/rank/{rank_type}/"
    if genre_channel != 'overall':
        base += f"{genre_channel}/"
    if page > 1:
        base += f"page{page}/"
    return base


def parse_qidian_chart(html: str) -> list[dict]:
    """Parse a rank page into [{position, bid, title, author}] (20/page)."""
    soup = BeautifulSoup(html, "lxml")
    out: list[dict] = []
    seen: set[int] = set()
    for li in soup.select("li[data-rid]"):
        a = li.select_one("h2 a[data-bid]") or li.select_one("a[data-bid]")
        if not a:
            continue
        raw_bid = a.get("data-bid")
        if not raw_bid or not raw_bid.isdigit():
            continue
        bid = int(raw_bid)
        if bid in seen:
            continue
        try:
            position = int(li.get("data-rid"))
        except (TypeError, ValueError):
            continue
        au = li.select_one("a.name")
        out.append({
            "position": position,
            "bid": bid,
            "title": a.get_text(strip=True) or None,
            "author": au.get_text(strip=True) if au else None,
        })
        seen.add(bid)
    return out


def _make_qq_session() -> requests.Session:
    """Proxied requests session for book.qq.com /so/ searches (tier-3 match)."""
    s = requests.Session()
    s.headers.update({"User-Agent": UA,
                      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8"})
    try:
        pm = _proxy_manager()
        s.proxies.update(pm.format_proxy_for_requests(pm.get_next_proxy()))
    except Exception as e:
        logger.warning("No proxy for qq session: %s", e)
    return s


def _fetch(url: str, rconn) -> str:
    """Fetch a rank page via the shared cookie + a rotating proxy.
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
        "Referer": "https://www.qidian.com/rank/",
    }
    proxies = None
    try:
        proxies = pm.format_proxy_for_requests(pm.get_next_proxy())
    except Exception as e:
        logger.warning("No proxy for qidian chart fetch: %s", e)

    resp = requests.get(url, headers=headers, proxies=proxies,
                         timeout=config.crawler['request_timeout'])
    if resp.status_code == 202 or "probe.js" in resp.text[:500]:
        qidian_cookie.request_remint(rconn)
        raise RuntimeError(f"qidian challenge on {url}; remint requested")
    resp.raise_for_status()
    return resp.text


def scrape_qidian_chart_page(rank_type: str, genre_channel: str,
                             page: int = 1) -> dict:
    """RQ worker: scrape one qidian rank page and replace its stored entries."""
    if rank_type not in QIDIAN_RANK_TYPES:
        return {'success': False, 'error': f'Unknown rank_type: {rank_type}'}
    if genre_channel not in QIDIAN_GENRE_CHANNELS:
        return {'success': False, 'error': f'Unknown channel: {genre_channel}'}

    url = build_qidian_chart_url(rank_type, genre_channel, page)
    rconn = get_redis()
    logger.info("Scraping qidian chart: %s", url)

    max_retries = 3
    for attempt in range(max_retries):
        try:
            html = _fetch(url, rconn)
            rows = parse_qidian_chart(html)
            if not rows:
                return {'success': True, 'url': url, 'entries_saved': 0,
                        'message': 'No books on page'}

            saved = 0
            qq_session = _make_qq_session()
            qm = _queue_manager()
            with db_manager.get_session() as db:
                db.query(QidianChartEntry).filter(
                    QidianChartEntry.rank_type == rank_type,
                    QidianChartEntry.genre_channel == genre_channel,
                    QidianChartEntry.page == page,
                ).delete()
                now = datetime.now(timezone.utc)
                for idx, row in enumerate(rows):
                    try:
                        # Full booklist-parity: qidian_id -> title(+author) ->
                        # qq /so/ search -> queue qq scrape -> else auto-insert.
                        book_id = resolve_book(
                            db, row['bid'], row['title'], row['author'],
                            qq_session=qq_session, queue_manager=qm,
                            allow_create=True)
                    except Exception as e:
                        logger.warning("resolve failed bid=%s: %s",
                                       row['bid'], e)
                        continue
                    if book_id is None:
                        continue
                    # data-rid resets 1-20 per page; store a continuous rank.
                    db.add(QidianChartEntry(
                        rank_type=rank_type,
                        genre_channel=genre_channel,
                        position=(page - 1) * QIDIAN_PER_PAGE + idx + 1,
                        page=page,
                        book_id=book_id,
                        scraped_at=now,
                    ))
                    saved += 1
                db.commit()

            logger.info("qidian chart %s: saved %d entries", url, saved)
            return {'success': True, 'url': url, 'entries_saved': saved,
                    'attempt': attempt + 1}

        except requests.RequestException as e:
            logger.warning("qidian chart request error (attempt %d): %s",
                            attempt + 1, e)
            if attempt < max_retries - 1:
                time.sleep(random.uniform(1.0, 3.0))
                continue
        except Exception as e:
            logger.error("qidian chart scrape error: %s", e)
            break

    return {'success': False, 'error': 'failed after all attempts',
            'url': url, 'attempts': max_retries}
