"""
Charts & Catalog Scraper Worker - Handles scraping QQ book rankings and catalog pages
"""

import time
import random
import logging
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

from core.config import config
from core.database import db_manager
from core.models import Book, QQChartEntry

logger = logging.getLogger(__name__)

# Rank type slug mapping for URL construction
RANK_TYPE_SLUGS = {
    'popular': 'sell',
    'new': 'new',
    'free': 'free',
    'completed': 'finish',
    'hall_of_fame': 'god',
    'knowledge': 'knowledge',
}

# Per-gender available rank types
GENDER_RANK_TYPES = {
    'male': ['popular', 'new', 'free', 'completed', 'hall_of_fame'],
    'female': ['popular', 'new', 'free', 'completed', 'hall_of_fame'],
    'publish': ['popular', 'new', 'knowledge'],
}

# Per-rank-type available cycles (QQ silently falls back to male for invalid combos)
RANK_TYPE_CYCLES = {
    'popular': ['cycle-1', 'cycle-2', 'cycle-3', 'cycle-4', 'cycle-5'],
    'new': ['cycle-1', 'cycle-2'],
    'free': ['cycle-1'],
    'completed': ['cycle-1', 'cycle-2'],
    'hall_of_fame': ['cycle-1', 'cycle-2', 'cycle-3', 'cycle-4'],
    'knowledge': ['cycle-1'],
}



def _extract_bids_from_html(html: str) -> list[str]:
    """Extract book IDs from mulan-bid attributes in the rendered HTML."""
    soup = BeautifulSoup(html, 'lxml')
    bids = []
    seen = set()
    for el in soup.find_all(attrs={'mulan-bid': True}):
        bid = el['mulan-bid'].strip()
        if bid and bid not in seen:
            bids.append(bid)
            seen.add(bid)
    return bids


def _build_chart_url(gender: str, slug: str, cycle: str, page: int) -> str:
    """Build chart URL with correct pagination format.

    Page 1: /book-rank/{gender}-{slug}/{cycle}
    Page 2+: /book-rank/{gender}-{slug}/{cycle}-{page}
    """
    if page <= 1:
        return f"https://book.qq.com/book-rank/{gender}-{slug}/{cycle}"
    return f"https://book.qq.com/book-rank/{gender}-{slug}/{cycle}-{page}"


def resolve_book_id(session, bid: str) -> int:
    """Look up book by URL, auto-insert if missing. Returns book.id."""
    url = f"https://book.qq.com/book-detail/{bid}"

    book = session.query(Book).filter(Book.url == url).first()
    if book:
        return book.id

    # Auto-insert new book with just URL so the pipeline picks it up
    new_book = Book(url=url)
    session.add(new_book)
    try:
        session.flush()
        logger.info(f"Auto-inserted new book for bid {bid} (id={new_book.id})")
        return new_book.id
    except Exception:
        session.rollback()
        # Race condition: another worker inserted it
        book = session.query(Book).filter(Book.url == url).first()
        if book:
            return book.id
        raise


def _create_scraper_session(proxy_string: str = None):
    """Create a requests session with proxy and browser headers.
    Reuses the same fingerprinting logic from BookScraper.
    """
    from workers.scraper import BookScraper
    scraper = BookScraper()
    return scraper._create_session(proxy_string)


def _get_proxy():
    """Get a proxy from the pool."""
    from services.proxy_manager import RedisProxyManager
    pm = RedisProxyManager()
    return pm.get_next_proxy()


def scrape_chart_page(gender: str, rank_type: str, cycle: str, page: int = 1) -> dict:
    """
    RQ worker: scrape a single chart page from book.qq.com/book-rank.

    URL pattern:
      page 1: https://book.qq.com/book-rank/{gender}-{slug}/{cycle}
      page N: https://book.qq.com/book-rank/{gender}-{slug}/{cycle}-{N}
    """
    slug = RANK_TYPE_SLUGS.get(rank_type)
    if not slug:
        return {'success': False, 'error': f'Unknown rank_type: {rank_type}'}

    url = _build_chart_url(gender, slug, cycle, page)
    logger.info(f"Scraping chart page: {url}")

    max_retries = 3
    for attempt in range(max_retries):
        try:
            proxy = _get_proxy()
            session = _create_scraper_session(proxy)
            session.headers['Referer'] = 'https://book.qq.com/book-rank'

            timeout = config.crawler['request_timeout']
            response = session.get(url, timeout=timeout)

            # 404/500 means this combo doesn't exist — not an error, just no data
            if response.status_code in (404, 500):
                logger.info(f"Chart page unavailable ({response.status_code}): {url}")
                return {
                    'success': True,
                    'url': url,
                    'entries_saved': 0,
                    'message': f'Page unavailable ({response.status_code})',
                }

            response.raise_for_status()

            bids = _extract_bids_from_html(response.text)
            if not bids:
                return {
                    'success': True,
                    'url': url,
                    'entries_saved': 0,
                    'message': 'No books found on page',
                }

            saved_count = 0
            with db_manager.get_session() as db_session:
                # Delete existing entries for this combo before inserting fresh data
                db_session.query(QQChartEntry).filter(
                    QQChartEntry.gender == gender,
                    QQChartEntry.rank_type == rank_type,
                    QQChartEntry.cycle == cycle,
                    QQChartEntry.page == page,
                ).delete()

                now = datetime.now(timezone.utc)

                for idx, bid in enumerate(bids):
                    try:
                        book_id = resolve_book_id(db_session, bid)
                    except Exception as e:
                        logger.warning(f"Failed to resolve book_id for bid {bid}: {e}")
                        continue

                    position = (page - 1) * 20 + idx + 1

                    entry = QQChartEntry(
                        gender=gender,
                        rank_type=rank_type,
                        cycle=cycle,
                        position=position,
                        page=page,
                        book_id=book_id,
                        scraped_at=now,
                    )
                    db_session.add(entry)
                    saved_count += 1

                db_session.commit()

            logger.info(f"Chart page {url}: saved {saved_count} entries")
            return {
                'success': True,
                'url': url,
                'entries_saved': saved_count,
                'attempt': attempt + 1,
            }

        except requests.RequestException as e:
            logger.warning(f"Chart scrape request error (attempt {attempt + 1}): {e}")
            if attempt < max_retries - 1:
                time.sleep(random.uniform(1.0, 3.0))
                continue

        except Exception as e:
            logger.error(f"Chart scrape error: {e}")
            break

    return {
        'success': False,
        'error': 'Chart scrape failed after all attempts',
        'url': url,
        'attempts': max_retries,
    }


