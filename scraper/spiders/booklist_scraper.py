"""
Qidiantu Booklist Scraper — Scrapes curated booklists from qidiantu.com
and matches books to our database via book.qq.com title search.
"""

import re
import time
import random
import logging
import requests
from urllib.parse import quote
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

import json

from core.database import db_manager
from core.models import Book, QidianBooklist, QidianBooklistItem, QidianBooklistFollow, Notification, NotificationPreference
from services.queue_manager import QueueManager

logger = logging.getLogger(__name__)

# Simple user agents for qidiantu.com (public site, no proxy needed)
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]


MAX_REASONABLE_COUNT = 100_000_000  # Official Qidian booklists can have ~54M followers


def _safe_int(value: int) -> int | None:
    """Cap value to a reasonable range. Returns None if obviously bogus."""
    if value > MAX_REASONABLE_COUNT:
        return None
    return value


def _strip_nul(text: str) -> str:
    """Remove NUL bytes that PostgreSQL rejects."""
    return text.replace('\x00', '') if text else text


def _clean_title(title: str) -> str:
    """Strip 《》 book title brackets and whitespace."""
    if not title:
        return title
    return _strip_nul(title.strip().strip('《》').strip())


class QidiantuBooklistScraper:

    BATCH_SIZE = 20  # concurrent pages per batch

    def __init__(self):
        self.queue_manager = QueueManager()
        from services.proxy_manager import RedisProxyManager
        self.proxy_manager = RedisProxyManager()
        # Separate session for book.qq.com (uses proxy)
        self._qq_session = None

    def _make_session(self, use_proxy: bool = True) -> requests.Session:
        """Create a new requests session with random UA and optional proxy."""
        session = requests.Session()
        session.headers.update({
            'User-Agent': random.choice(USER_AGENTS),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
        })
        if use_proxy:
            try:
                proxy_str = self.proxy_manager.get_next_proxy()
                proxy_dict = self.proxy_manager.format_proxy_for_requests(proxy_str)
                session.proxies.update(proxy_dict)
            except Exception as e:
                logger.warning(f"No proxy available: {e}")
        return session

    def _delay(self, min_s=1.0, max_s=2.5):
        time.sleep(random.uniform(min_s, max_s))

    def _get_qq_session(self):
        """Lazy-init a proxied session for book.qq.com requests"""
        if self._qq_session is None:
            self._qq_session = self._make_session(use_proxy=True)
        return self._qq_session

    # ========================================================================
    # Step 1: Crawl booklist index (concurrent 5-page batches)
    # ========================================================================

    def _fetch_index_page(self, page: int, max_retries: int = 3) -> tuple[int, list[dict], bool, bool]:
        """Fetch and parse a single index page with retries. Returns (page, entries, has_next, was_network_error)."""
        url = f"https://www.qidiantu.com/booklists/{page}/"

        for attempt in range(1, max_retries + 1):
            session = self._make_session(use_proxy=True)
            try:
                resp = session.get(url, timeout=30)
                if resp.status_code == 404:
                    return (page, [], False, False)
                resp.raise_for_status()

                soup = BeautifulSoup(resp.text, 'html.parser')
                entries = self._parse_index_page(soup)
                has_next = bool(soup.find('a', string=re.compile(r'下一页|›|»|next', re.IGNORECASE)))
                return (page, entries, has_next, False)

            except requests.RequestException as e:
                logger.warning(f"Page {page} attempt {attempt}/{max_retries} failed: {e}")
                if attempt < max_retries:
                    time.sleep(random.uniform(1, 3))

        logger.warning(f"Page {page}: all {max_retries} retries exhausted")
        return (page, [], True, True)

    def crawl_booklist_index(self, max_pages: int = 10000, upsert_progressively: bool = False) -> list[dict]:
        """Crawl paginated booklist index pages in concurrent batches of 20.
        If upsert_progressively=True, upserts each batch to DB immediately.
        Stops early when all entries in a batch already exist in the DB
        (index is newest-first, so hitting known entries means we've caught up)."""
        all_lists = []
        page = 1
        consecutive_empty_batches = 0
        consecutive_all_known_batches = 0
        total_created = 0
        total_updated = 0

        # Load existing booklist IDs so we can detect when we've caught up
        known_ids: set[int] = set()
        try:
            with db_manager.get_session() as session:
                rows = session.query(QidianBooklist.qidiantu_id).all()
                known_ids = {r.qidiantu_id for r in rows}
            logger.info(f"Loaded {len(known_ids)} known booklist IDs from DB")
        except Exception as e:
            logger.warning(f"Failed to load known booklist IDs: {e}")

        while page <= max_pages:
            batch_end = min(page + self.BATCH_SIZE, max_pages + 1)
            batch_pages = list(range(page, batch_end))
            logger.info(f"Fetching index pages {batch_pages[0]}-{batch_pages[-1]} concurrently...")

            with ThreadPoolExecutor(max_workers=self.BATCH_SIZE) as pool:
                futures = {pool.submit(self._fetch_index_page, p): p for p in batch_pages}
                results = {}
                for future in as_completed(futures):
                    p = futures[future]
                    results[p] = future.result()

            # Process in order — skip failed pages, only stop when truly done
            batch_found = 0
            batch_entries = []
            last_has_next = True
            batch_all_network_errors = True
            for p in batch_pages:
                pg, entries, has_next, was_network_error = results[p]
                if entries:
                    all_lists.extend(entries)
                    batch_entries.extend(entries)
                    batch_found += len(entries)
                    batch_all_network_errors = False
                    logger.info(f"Page {pg}: found {len(entries)} booklists (total: {len(all_lists)})")
                else:
                    if not was_network_error:
                        batch_all_network_errors = False
                    logger.debug(f"Page {pg}: no entries (skipping)")
                last_has_next = has_next

            if batch_found > 0:
                consecutive_empty_batches = 0

                # Check how many entries are already known
                new_in_batch = [e for e in batch_entries if e['qidiantu_id'] not in known_ids]
                if new_in_batch:
                    consecutive_all_known_batches = 0
                    # Add newly seen IDs to known set
                    for e in new_in_batch:
                        known_ids.add(e['qidiantu_id'])
                else:
                    consecutive_all_known_batches += 1
                    logger.info(f"Batch {batch_pages[0]}-{batch_pages[-1]}: all {batch_found} entries already in DB ({consecutive_all_known_batches} consecutive)")

                if upsert_progressively and batch_entries:
                    result = self._upsert_booklists(batch_entries)
                    total_created += result['created']
                    total_updated += result['updated']
                    logger.info(f"Batch upserted: {result['created']} created, {result['updated']} updated (total in DB: {total_created} created, {total_updated} updated)")
                else:
                    logger.info(f"Batch complete: {batch_found} booklists found ({len(new_in_batch)} new)")
            elif batch_all_network_errors:
                # Don't count network failures as empty — just skip and continue
                logger.warning(f"Batch {batch_pages[0]}-{batch_pages[-1]}: all network errors, skipping (not counting as empty)")
            else:
                consecutive_empty_batches += 1
                logger.warning(f"Batch {batch_pages[0]}-{batch_pages[-1]}: all empty ({consecutive_empty_batches} consecutive)")

            # Stop if 2 consecutive batches where all entries already exist in DB
            if consecutive_all_known_batches >= 2:
                logger.info("2 consecutive batches with all known entries — caught up, stopping")
                break
            # Stop if 5 consecutive truly empty batches (not network errors), or last page has no next link
            if consecutive_empty_batches >= 5:
                logger.info("5 consecutive empty batches, stopping")
                break
            if not last_has_next and batch_found == 0 and not batch_all_network_errors:
                logger.info("No next page link and no results, stopping")
                break

            page = batch_end
            self._delay(0.5, 1.5)

        logger.info(f"Index crawl complete: {len(all_lists)} booklists found ({total_created} new)")
        return all_lists

    def _parse_index_page(self, soup: BeautifulSoup) -> list[dict]:
        """Parse a single booklist index page. Structure:
        div.panel.panel-default > div.panel-heading (metadata) + div.panel-body (description)
        """
        entries = []

        for panel in soup.find_all('div', class_='panel-default'):
            try:
                heading = panel.find('div', class_='panel-heading')
                if not heading:
                    continue

                # Booklist link: <a href="/booklist/{id}"><h4>Title</h4></a>
                bl_link = heading.find('a', href=re.compile(r'/booklist/(\d+)'))
                if not bl_link:
                    continue
                match = re.search(r'/booklist/(\d+)', bl_link['href'])
                if not match:
                    continue

                qidiantu_id = int(match.group(1))
                if any(e['qidiantu_id'] == qidiantu_id for e in entries):
                    continue

                title = bl_link.get_text(strip=True) or None

                # Creator: <a href="/booklister/{id}">Name</a>
                # Tags: <a href="/tag/...">TagName</a>
                tag_links = heading.find_all('a', href=re.compile(r'/tag/'))
                tags = [t.get_text(strip=True) for t in tag_links if t.get_text(strip=True)]

                # Counts + date from <p> text
                heading_text = heading.get_text(separator=' ')
                follower_count = None
                fm = re.search(r'(\d+)\s*人关注', heading_text)
                if fm:
                    follower_count = _safe_int(int(fm.group(1)))

                book_count = None
                bm = re.search(r'当前收录(\d+)本', heading_text)
                if not bm:
                    bm = re.search(r'收录过(\d+)本', heading_text)
                if bm:
                    book_count = _safe_int(int(bm.group(1)))

                last_updated_at = None
                dm = re.search(r'最后更新于：(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})', heading_text)
                if dm:
                    try:
                        last_updated_at = datetime.strptime(dm.group(1), '%Y-%m-%d %H:%M').replace(tzinfo=timezone.utc)
                    except ValueError:
                        pass

                # Description: in .panel-body <p>
                description = None
                body = panel.find('div', class_='panel-body')
                if body:
                    desc_p = body.find('p')
                    if desc_p:
                        text = desc_p.get_text(strip=True)
                        if text and '查看本书单' not in text:
                            description = _strip_nul(text)

                entries.append({
                    'qidiantu_id': qidiantu_id,
                    'title': title,
                    'description': description,
                    'tags': tags if tags else None,
                    'follower_count': follower_count,
                    'book_count': book_count,
                    'last_updated_at': last_updated_at,
                })

            except Exception as e:
                logger.warning(f"Error parsing booklist entry: {e}")
                continue

        return entries

    def _upsert_booklists(self, booklist_data: list[dict]) -> dict:
        """Upsert booklist metadata into the database. Processes one-by-one
        so a single bad entry doesn't fail the entire batch."""
        created = 0
        updated = 0

        for data in booklist_data:
            try:
                with db_manager.get_session() as session:
                    existing = session.query(QidianBooklist).filter(
                        QidianBooklist.qidiantu_id == data['qidiantu_id']
                    ).first()

                    if existing:
                        if data.get('title'):
                            existing.title = data['title']
                        if data.get('description'):
                            existing.description = data['description']
                        if data.get('tags'):
                            existing.tags = data['tags']
                        if data.get('follower_count') is not None:
                            existing.follower_count = data['follower_count']
                        if data.get('book_count') is not None:
                            existing.book_count = data['book_count']
                        if data.get('last_updated_at'):
                            existing.last_updated_at = data['last_updated_at']
                        updated += 1
                    else:
                        booklist = QidianBooklist(
                            qidiantu_id=data['qidiantu_id'],
                            title=data.get('title'),
                            description=data.get('description'),
                            tags=data.get('tags'),
                            follower_count=data.get('follower_count'),
                            book_count=data.get('book_count'),
                            last_updated_at=data.get('last_updated_at'),
                        )
                        session.add(booklist)
                        created += 1
            except Exception as e:
                logger.warning(f"Failed to upsert booklist {data.get('qidiantu_id')}: {e}")

        return {'created': created, 'updated': updated}

    # ========================================================================
    # Step 2: Crawl each booklist's books
    # ========================================================================

    def crawl_booklist_books(self, qidiantu_id: int, max_pages: int = 50) -> list[dict]:
        """Crawl all pages of a single booklist. Pagination is link-based:
        page 1 = /booklist/{id}, next pages found via '后十本' links."""
        all_books = []
        url = f"https://www.qidiantu.com/booklist/{qidiantu_id}"
        seen_urls = set()

        for page_num in range(1, max_pages + 1):
            if url in seen_urls:
                break
            seen_urls.add(url)

            session = self._make_session(use_proxy=True)
            logger.info(f"Crawling booklist {qidiantu_id} page {page_num}: {url}")

            try:
                resp = session.get(url, timeout=30)
                if resp.status_code == 404:
                    break
                resp.raise_for_status()
            except requests.RequestException as e:
                logger.warning(f"Failed to fetch booklist {qidiantu_id} page {page_num}: {e}")
                self._delay(3, 5)
                continue

            soup = BeautifulSoup(resp.text, 'html.parser')

            if page_num == 1:
                self._update_booklist_metadata(qidiantu_id, soup)

            books = self._parse_booklist_page(soup, position_offset=len(all_books))

            if not books:
                break

            all_books.extend(books)
            logger.info(f"Booklist {qidiantu_id} page {page_num}: {len(books)} books (total: {len(all_books)})")

            # Follow '后十本' (next 10 books) link
            next_link = soup.find('a', string=re.compile(r'后十本'))
            if not next_link or not next_link.get('href'):
                break

            next_href = next_link['href']
            url = f"https://www.qidiantu.com{next_href}" if next_href.startswith('/') else next_href
            self._delay()

        logger.info(f"Booklist {qidiantu_id}: {len(all_books)} total books")
        return all_books

    def _update_booklist_metadata(self, qidiantu_id: int, soup: BeautifulSoup):
        """Extract and update booklist metadata from the detail page.
        Structure: div.panel-heading with h1, /tag/ links, counts.
        """
        try:
            heading = soup.find('div', class_='panel-heading')
            if not heading:
                return

            with db_manager.get_session() as session:
                booklist = session.query(QidianBooklist).filter(
                    QidianBooklist.qidiantu_id == qidiantu_id
                ).first()
                if not booklist:
                    booklist = QidianBooklist(qidiantu_id=qidiantu_id)
                    session.add(booklist)

                h1 = heading.find('h1')
                if h1:
                    new_title = _clean_title(h1.get_text(strip=True))
                    if new_title and new_title != booklist.title:
                        booklist.title = new_title
                        booklist.title_translated = None

                tag_links = heading.find_all('a', href=re.compile(r'/tag/'))
                tags = [t.get_text(strip=True) for t in tag_links if t.get_text(strip=True)]
                if tags:
                    booklist.tags = tags

                heading_text = heading.get_text(separator=' ')
                fm = re.search(r'(\d+)\s*人关注', heading_text)
                booklist.follower_count = _safe_int(int(fm.group(1))) if fm else 0

                bm = re.search(r'当前收录(\d+)本', heading_text)
                if not bm:
                    bm = re.search(r'收录过(\d+)本', heading_text)
                if bm:
                    booklist.book_count = _safe_int(int(bm.group(1)))

                dm = re.search(r'最后更新于：(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})', heading_text)
                if dm:
                    try:
                        booklist.last_updated_at = datetime.strptime(dm.group(1), '%Y-%m-%d %H:%M').replace(tzinfo=timezone.utc)
                    except ValueError:
                        pass

                # Description: in panel-body after panel-heading
                body = heading.find_next_sibling('div', class_='panel-body')
                if body:
                    desc_text = _strip_nul(body.get_text(strip=True))
                    if desc_text and desc_text != booklist.description:
                        booklist.description = desc_text
                        booklist.description_translated = None

                booklist.last_scraped_at = datetime.now(timezone.utc)

        except Exception as e:
            logger.warning(f"Failed to update booklist metadata for {qidiantu_id}: {e}")

    def _parse_booklist_page(self, soup: BeautifulSoup, position_offset: int = 0) -> list[dict]:
        """Parse books from a single booklist page. Each book is a group of 3 panels:
        1. panel-info: title, author, stats
        2. panel-success: book synopsis (作品信息)
        3. panel-primary: curator comment (单主评论) + ❤️count + 收录于:date
        """
        books = []
        all_panels = soup.find_all('div', class_='panel')

        # Walk through panels and group them per book
        idx = 0
        book_num = 0
        while idx < len(all_panels):
            panel = all_panels[idx]
            classes = panel.get('class', [])

            # Book entry starts with panel-info
            if 'panel-info' not in classes:
                idx += 1
                continue

            try:
                heading = panel.find('div', class_='panel-heading')
                if not heading:
                    idx += 1
                    continue

                info_link = heading.find('a', href=re.compile(r'/info/(\d+)'))
                if not info_link:
                    idx += 1
                    continue

                match = re.search(r'/info/(\d+)', info_link['href'])
                if not match:
                    idx += 1
                    continue

                qidian_book_id = int(match.group(1))
                title = _clean_title(info_link.get_text(strip=True)) or None

                author = None
                author_link = heading.find('a', href=re.compile(r'/author/'))
                if author_link:
                    author = author_link.get_text(strip=True)

                # Look ahead for panel-primary (curator comment) within next 2 panels
                curator_comment = None
                heart_count = None
                added_at = None

                for offset in range(1, 3):
                    if idx + offset >= len(all_panels):
                        break
                    next_panel = all_panels[idx + offset]
                    next_classes = next_panel.get('class', [])

                    if 'panel-primary' in next_classes:
                        body = next_panel.find('div', class_='panel-body')
                        if body:
                            # Curator comment: all <p> text
                            paragraphs = body.find_all('p')
                            comment_parts = [p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)]
                            if comment_parts:
                                curator_comment = _strip_nul('\n'.join(comment_parts))

                            # Heart count: ❤️NNN in body text
                            body_text = body.get_text()
                            hm = re.search(r'❤️\s*(\d+)', body_text)
                            if hm:
                                heart_count = int(hm.group(1))

                            # Added date: 收录于:YYYY-MM-DD
                            dm = re.search(r'收录于[:：]\s*(\d{4}-\d{2}-\d{2})', body_text)
                            if dm:
                                try:
                                    added_at = datetime.strptime(dm.group(1), '%Y-%m-%d').replace(tzinfo=timezone.utc)
                                except ValueError:
                                    pass
                        break

                book_num += 1
                books.append({
                    'qidian_book_id': qidian_book_id,
                    'title': title,
                    'author': author,
                    'curator_comment': curator_comment,
                    'heart_count': heart_count,
                    'added_at': added_at,
                    'position': position_offset + book_num,
                })

            except Exception as e:
                logger.warning(f"Error parsing book entry: {e}")

            idx += 1

        return books

    # ========================================================================
    # Step 3: Match books to our DB
    # ========================================================================

    def match_book(self, qidian_book_id: int, title: str) -> Optional[int]:
        """Try to match a qidiantu book to our database. Returns book.id or None."""

        with db_manager.get_session() as session:
            # 1. Check by qidian_id (instant match if seen before)
            book = session.query(Book).filter(Book.qidian_id == qidian_book_id).first()
            if book:
                logger.debug(f"Matched by qidian_id: {qidian_book_id} -> book {book.id}")
                return book.id

            # 2. Check by exact Chinese title
            if title:
                book = session.query(Book).filter(Book.title == title).first()
                if book:
                    # Update qidian_id on the matched book
                    book.qidian_id = qidian_book_id
                    book.qidiantu_url = f"https://www.qidiantu.com/info/{qidian_book_id}"
                    logger.info(f"Matched by title '{title}' -> book {book.id}")
                    return book.id

        # 3. Search book.qq.com by title
        if title:
            bid = self._search_qq_book(title)
            if bid:
                qq_url = f"https://book.qq.com/book-detail/{bid}"
                with db_manager.get_session() as session:
                    book = session.query(Book).filter(Book.url == qq_url).first()
                    if book:
                        book.qidian_id = qidian_book_id
                        book.qidiantu_url = f"https://www.qidiantu.com/info/{qidian_book_id}"
                        logger.info(f"Matched via qq.com search: '{title}' -> book {book.id}")
                        return book.id

                    # 4. Book found on qq.com but not in our DB — queue for scraping
                    try:
                        job_id = self.queue_manager.add_scrape_job(qq_url)
                        logger.info(f"Queued new book for scraping: {qq_url} (job: {job_id})")
                    except Exception as e:
                        logger.warning(f"Failed to queue scrape for {qq_url}: {e}")

        return None

    def _search_qq_book(self, title: str) -> Optional[str]:
        """Search book.qq.com/so/{title} and return the bid if an exact title match is found.

        The __NUXT__ data is a JS function expression (not JSON), so we extract
        bid/title pairs directly via regex from the raw script text.
        """
        try:
            encoded_title = quote(title)
            url = f"https://book.qq.com/so/{encoded_title}"

            qq_session = self._get_qq_session()
            resp = qq_session.get(url, timeout=30)
            resp.raise_for_status()

            # Extract the __NUXT__ script block
            nuxt_match = re.search(r'window\.__NUXT__\s*=\s*(.+?);\s*</script>', resp.text, re.DOTALL)
            if not nuxt_match:
                return None

            nuxt_text = nuxt_match.group(1)

            # Find all bid:NUMBER patterns followed by their title
            # The NUXT JS has objects like {bid:804248,...,title:"玄界之门",...}
            # We extract bid+title pairs by finding bid then the nearest title
            for bid_match in re.finditer(r'\bbid:(\d+)', nuxt_text):
                bid = bid_match.group(1)
                # Look for the title field near this bid (within next 500 chars)
                after = nuxt_text[bid_match.end():bid_match.end() + 500]
                title_match = re.search(r'\btitle:(["\'])(.+?)\1', after)
                if not title_match:
                    # Title might be a variable reference — check if it equals search term
                    # The NUXT function substitutes variables, so title might be param like 'g'
                    # In that case the variable holds the search keyword = our title
                    title_var_match = re.search(r'\btitle:([a-z])\b', after)
                    if title_var_match:
                        # Variable reference — the search keyword IS the title
                        logger.info(f"Found bid {bid} with variable title (assuming match for '{title}')")
                        return bid
                    continue

                found_title = title_match.group(2)
                if found_title == title:
                    logger.info(f"Found exact match on qq.com: '{title}' -> bid {bid}")
                    return bid

            return None

        except Exception as e:
            logger.warning(f"qq.com search failed for '{title}': {e}")
            return None

    # ========================================================================
    # Step 4: Save booklist items and match books
    # ========================================================================

    def save_booklist_items(self, qidiantu_id: int, books_data: list[dict]) -> dict:
        """Match books and save/update booklist items."""
        matched = 0
        unmatched = 0
        items_saved = 0

        with db_manager.get_session() as session:
            booklist = session.query(QidianBooklist).filter(
                QidianBooklist.qidiantu_id == qidiantu_id
            ).first()

            if not booklist:
                logger.error(f"Booklist {qidiantu_id} not found in database")
                return {'error': 'booklist_not_found'}

            booklist_id = booklist.id

        for book_data in books_data:
            qidian_book_id = book_data['qidian_book_id']
            title = book_data.get('title', '')

            # Try to match book
            book_id = self.match_book(qidian_book_id, title)
            if book_id:
                matched += 1
            else:
                unmatched += 1

            # Upsert booklist item
            with db_manager.get_session() as session:
                existing = session.query(QidianBooklistItem).filter(
                    QidianBooklistItem.booklist_id == booklist_id,
                    QidianBooklistItem.qidian_book_id == qidian_book_id,
                ).first()

                if existing:
                    existing.book_id = book_id
                    if book_data.get('position'):
                        existing.position = book_data['position']
                    if book_data.get('curator_comment'):
                        if book_data['curator_comment'] != existing.curator_comment:
                            existing.curator_comment = book_data['curator_comment']
                            existing.curator_comment_translated = None
                    if book_data.get('heart_count') is not None:
                        existing.heart_count = book_data['heart_count']
                    if book_data.get('added_at'):
                        existing.added_at = book_data['added_at']
                else:
                    item = QidianBooklistItem(
                        booklist_id=booklist_id,
                        book_id=book_id,
                        qidian_book_id=qidian_book_id,
                        position=book_data.get('position'),
                        curator_comment=book_data.get('curator_comment'),
                        heart_count=book_data.get('heart_count'),
                        added_at=book_data.get('added_at'),
                    )
                    session.add(item)
                    items_saved += 1

            # Rate limit for qq.com searches
            self._delay(0.5, 1.5)

        # Notify followers about new items added to this booklist
        if items_saved > 0:
            try:
                with db_manager.get_session() as notif_session:
                    # Get booklist info
                    booklist = notif_session.query(QidianBooklist).filter(
                        QidianBooklist.qidiantu_id == qidiantu_id
                    ).first()
                    if booklist:
                        booklist_title = booklist.title_translated or booklist.title or 'Unknown'

                        # Get all followers of this booklist
                        follower_ids = [
                            row.user_id for row in
                            notif_session.query(QidianBooklistFollow.user_id).filter(
                                QidianBooklistFollow.booklist_id == booklist.id
                            ).all()
                        ]

                        if follower_ids:
                            # Deduplicate: skip users who got this notification in last 6 hours
                            from datetime import timedelta
                            six_hours_ago = datetime.now(timezone.utc) - timedelta(hours=6)
                            existing = notif_session.query(Notification.user_id).filter(
                                Notification.type == 'qidian_booklist_updated',
                                Notification.user_id.in_(follower_ids),
                                Notification.created_at >= six_hours_ago,
                            ).all()
                            existing_user_ids = {row.user_id for row in existing}

                            # Check disabled preferences
                            disabled = notif_session.query(NotificationPreference.user_id).filter(
                                NotificationPreference.user_id.in_(follower_ids),
                                NotificationPreference.type == 'qidian_booklist_updated',
                                NotificationPreference.enabled == False,  # noqa: E712 — SQLAlchemy requires == for SQL expressions
                            ).all()
                            disabled_user_ids = {row.user_id for row in disabled}

                            metadata = json.dumps({
                                'booklistId': booklist.id,
                                'booklistName': booklist_title,
                                'itemCount': items_saved,
                            })

                            to_notify = [
                                uid for uid in follower_ids
                                if uid not in existing_user_ids and uid not in disabled_user_ids
                            ]

                            for i in range(0, len(to_notify), 1000):
                                chunk = to_notify[i:i+1000]
                                notif_session.bulk_save_objects([
                                    Notification(
                                        user_id=uid,
                                        type='qidian_booklist_updated',
                                        metadata_=metadata,
                                    )
                                    for uid in chunk
                                ])
                            notif_session.commit()
                            logger.info(f"Sent qidian_booklist_updated notifications to {len(to_notify)} followers for booklist {qidiantu_id}")
            except Exception as e:
                logger.warning(f"Failed to send booklist update notifications for {qidiantu_id}: {e}")

        return {
            'matched': matched,
            'unmatched': unmatched,
            'items_saved': items_saved,
        }

    # ========================================================================
    # Step 5: Queue translations
    # ========================================================================

    def queue_booklist_translations(self) -> dict:
        """Queue translation jobs for untranslated booklist content."""
        queued = 0

        with db_manager.get_session() as session:
            # Find booklists needing translation
            booklists = session.query(QidianBooklist).filter(
                (QidianBooklist.title_translated.is_(None)) |
                (QidianBooklist.description_translated.is_(None))
            ).all()

            for bl in booklists:
                try:
                    self.queue_manager.add_translation_job(bl.id, 'booklist')
                    queued += 1
                except Exception as e:
                    logger.warning(f"Failed to queue booklist translation for {bl.id}: {e}")

        logger.info(f"Queued {queued} booklist translation jobs")
        return {'queued': queued}

    # ========================================================================
    # Public entry points
    # ========================================================================

    def scrape_single_booklist(self, qidiantu_id: int) -> dict:
        """Scrape a single booklist by its qidiantu ID."""
        logger.info(f"Scraping single booklist: {qidiantu_id}")

        # Ensure booklist exists in DB
        with db_manager.get_session() as session:
            existing = session.query(QidianBooklist).filter(
                QidianBooklist.qidiantu_id == qidiantu_id
            ).first()
            if not existing:
                booklist = QidianBooklist(qidiantu_id=qidiantu_id)
                session.add(booklist)

        # Crawl books from this booklist
        books_data = self.crawl_booklist_books(qidiantu_id)

        # Save and match
        result = self.save_booklist_items(qidiantu_id, books_data)
        result['total_books'] = len(books_data)
        result['qidiantu_id'] = qidiantu_id

        logger.info(f"Booklist {qidiantu_id} complete: {result}")
        return result

    def _scrape_one_booklist(self, qidiantu_id: int) -> dict:
        """Scrape a single booklist's books and match them. Thread-safe."""
        try:
            books_data = self.crawl_booklist_books(qidiantu_id)
            result = self.save_booklist_items(qidiantu_id, books_data)
            logger.info(f"Booklist {qidiantu_id}: {len(books_data)} books, {result.get('matched', 0)} matched")
            return result
        except Exception as e:
            logger.error(f"Failed to scrape booklist {qidiantu_id}: {e}")
            return {'matched': 0, 'unmatched': 0, 'items_saved': 0}

    def scrape_all_booklists(self) -> dict:
        """Full scrape: crawl index, then scrape booklists in concurrent batches of 5."""
        logger.info("Starting full booklist scrape")

        # Step 1: Crawl index
        index_data = self.crawl_booklist_index()
        upsert_result = self._upsert_booklists(index_data)
        logger.info(f"Index: {upsert_result}")

        # Step 2: Scrape booklists in batches of 5
        total_matched = 0
        total_unmatched = 0
        total_items = 0

        ids = [bl['qidiantu_id'] for bl in index_data]
        for i in range(0, len(ids), self.BATCH_SIZE):
            batch = ids[i:i + self.BATCH_SIZE]
            logger.info(f"Scraping booklist batch {i // self.BATCH_SIZE + 1}: {batch}")

            with ThreadPoolExecutor(max_workers=self.BATCH_SIZE) as pool:
                futures = {pool.submit(self._scrape_one_booklist, bid): bid for bid in batch}
                for future in as_completed(futures):
                    result = future.result()
                    total_matched += result.get('matched', 0)
                    total_unmatched += result.get('unmatched', 0)
                    total_items += result.get('items_saved', 0)

            self._delay(1, 2)

        # Step 3: Queue translations
        translation_result = self.queue_booklist_translations()

        return {
            'booklists_found': len(index_data),
            'booklists_created': upsert_result['created'],
            'booklists_updated': upsert_result['updated'],
            'total_matched': total_matched,
            'total_unmatched': total_unmatched,
            'total_items_saved': total_items,
            'translations_queued': translation_result['queued'],
        }


# ============================================================================
# RQ Worker entry points
# ============================================================================

def scrape_single_booklist(qidiantu_id: int) -> dict:
    scraper = QidiantuBooklistScraper()
    return scraper.scrape_single_booklist(qidiantu_id)


def scrape_all_booklists() -> dict:
    scraper = QidiantuBooklistScraper()
    return scraper.scrape_all_booklists()
