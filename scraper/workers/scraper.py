"""
Scraper Worker - Handles scraping books and saving to database
"""

import requests
from bs4 import BeautifulSoup
import re
import time
import random
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

import json

from core.config import config
from core.database import db_manager
from core.models import Book, Chapter, Genre, QQUser, BookComment, Bookmark, Notification, NotificationPreference
from services.queue_manager import QueueManager
from workers.stats import upload_book_image


_BR_RE = re.compile(r'<br\s*/?>', re.IGNORECASE)
_HTML_TAG_RE = re.compile(r'<[^>]+>')
_WHITESPACE_RE = re.compile(r'[^\S\n]+')
_MULTI_NEWLINE_RE = re.compile(r'\n{3,}')
_EMOT_RE = re.compile(r'\[emot=(\w+),(\d+)/\]')

# Qidian emot ID -> Unicode emoji mapping
_EMOT_MAP = {
    ('default', '1'): '😀', ('default', '2'): '😁', ('default', '3'): '😂',
    ('default', '4'): '🤣', ('default', '5'): '😃', ('default', '6'): '😄',
    ('default', '7'): '😅', ('default', '8'): '😆', ('default', '9'): '😉',
    ('default', '10'): '😊', ('default', '11'): '😋', ('default', '12'): '😎',
    ('default', '13'): '😍', ('default', '14'): '😘', ('default', '15'): '😗',
    ('default', '16'): '😙', ('default', '17'): '😚', ('default', '18'): '🤗',
    ('default', '19'): '🤔', ('default', '20'): '😐', ('default', '21'): '😑',
    ('default', '22'): '😶', ('default', '23'): '🙄', ('default', '24'): '😏',
    ('default', '25'): '😣', ('default', '26'): '😥', ('default', '27'): '😮',
    ('default', '28'): '🤐', ('default', '29'): '😯', ('default', '30'): '😪',
    ('default', '31'): '😫', ('default', '32'): '😴', ('default', '33'): '😌',
    ('default', '34'): '😛', ('default', '35'): '😜', ('default', '36'): '😝',
    ('default', '37'): '🤤', ('default', '38'): '😒', ('default', '39'): '😓',
    ('default', '40'): '😔', ('default', '41'): '😕', ('default', '42'): '🙃',
    ('default', '43'): '🤑', ('default', '44'): '😲', ('default', '45'): '😷',
    ('default', '46'): '🤒', ('default', '47'): '🤕', ('default', '48'): '🤢',
    ('default', '49'): '🤧', ('default', '50'): '😇', ('default', '51'): '🤠',
    ('default', '52'): '🤡', ('default', '53'): '🤥', ('default', '54'): '😈',
    ('default', '55'): '👿', ('default', '56'): '👹', ('default', '57'): '💀',
    ('default', '58'): '👻', ('default', '59'): '👽', ('default', '60'): '🤖',
    ('default', '61'): '💩', ('default', '62'): '😺', ('default', '63'): '😸',
    ('default', '64'): '😹', ('default', '65'): '😻', ('default', '66'): '😼',
    ('default', '67'): '😽', ('default', '68'): '🙀', ('default', '69'): '😿',
    ('default', '70'): '😾', ('default', '71'): '🙈', ('default', '72'): '🙉',
    ('default', '73'): '🙊', ('default', '74'): '👶', ('default', '75'): '👦',
    ('default', '76'): '👧', ('default', '77'): '👨', ('default', '78'): '👩',
    ('default', '79'): '👴', ('default', '80'): '👍', ('default', '81'): '👎',
    ('default', '82'): '👊', ('default', '83'): '✊', ('default', '84'): '🤞',
    ('default', '85'): '✌️', ('default', '86'): '🤘', ('default', '87'): '👌',
    ('default', '88'): '👈', ('default', '89'): '👉', ('default', '90'): '👆',
    ('default', '91'): '👇', ('default', '92'): '☝️', ('default', '93'): '✋',
    ('default', '94'): '🤚', ('default', '95'): '🖐️', ('default', '96'): '🖖',
    ('default', '97'): '👋', ('default', '98'): '🤙', ('default', '99'): '💪',
    ('default', '100'): '🖕',
}


def _replace_emot(match: re.Match) -> str:
    """Replace Qidian [emot=...] tag with Unicode emoji or strip it."""
    group, emot_id = match.group(1), match.group(2)
    return _EMOT_MAP.get((group, emot_id), '')


def _clean_comment_text(text: str) -> str:
    """Strip HTML tags, normalize whitespace and control characters from comment text"""
    if not text:
        return text
    text = _BR_RE.sub('\n', text)
    text = _HTML_TAG_RE.sub('', text)
    text = _EMOT_RE.sub(_replace_emot, text)
    text = _WHITESPACE_RE.sub(' ', text)
    text = _MULTI_NEWLINE_RE.sub('\n\n', text)
    return text.strip()


_CHINESE_RE = re.compile(r'[\u4e00-\u9fff]')

def _is_valid_genre_name(name: str) -> bool:
    """Validate genre name: must contain Chinese characters and be 2+ chars."""
    if not name or len(name) < 2:
        return False
    return bool(_CHINESE_RE.search(name))


def extract_bid_from_url(url: str) -> str:
    """Extract book ID (bid) from a book.qq.com URL"""
    match = re.search(r'/book-detail/(\d+)', url)
    if match:
        return match.group(1)
    raise ValueError(f"Cannot extract bid from URL: {url}")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BookScraper:
    """Book scraper with Redis proxy management"""

    def __init__(self):
        # Import locally to avoid Redis connection during module import
        from services.proxy_manager import RedisProxyManager
        self.proxy_manager = RedisProxyManager()
        self.queue_manager = QueueManager()

    def _generate_browser_headers(self) -> Dict[str, str]:
        """Generate realistic browser headers with fingerprinting evasion"""

        # Browser profiles with consistent header sets
        browsers = [
            {
                'name': 'chrome',
                'user_agents': [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ],
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'sec_fetch_dest': 'document',
                'sec_fetch_mode': 'navigate',
                'sec_fetch_site': 'none',
                'sec_fetch_user': '?1'
            },
            {
                'name': 'firefox',
                'user_agents': [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
                    'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'
                ],
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'sec_fetch_dest': None,  # Firefox doesn't use sec-fetch headers
                'sec_fetch_mode': None,
                'sec_fetch_site': None,
                'sec_fetch_user': None
            },
            {
                'name': 'edge',
                'user_agents': [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0'
                ],
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'sec_fetch_dest': 'document',
                'sec_fetch_mode': 'navigate',
                'sec_fetch_site': 'none',
                'sec_fetch_user': '?1'
            }
        ]

        # Select random browser
        browser = random.choice(browsers)
        user_agent = random.choice(browser['user_agents'])

        # Language variations
        languages = [
            'en-US,en;q=0.9',
            'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
            'en-GB,en-US;q=0.9,en;q=0.8',
            'en-US,en;q=0.5',
            'en-US,en;q=0.9,es;q=0.8',
        ]

        # Encoding variations
        encodings = [
            'gzip, deflate, br',
            'gzip, deflate',
            'gzip, deflate, br, zstd'
        ]

        # Build headers
        headers = {
            'User-Agent': user_agent,
            'Accept': browser['accept'],
            'Accept-Language': random.choice(languages),
            'Accept-Encoding': random.choice(encodings),
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'DNT': str(random.choice([0, 1])),  # Do Not Track randomly
        }

        # Add browser-specific headers
        if browser['sec_fetch_dest']:  # Chrome/Edge specific
            headers.update({
                'Sec-Fetch-Dest': browser['sec_fetch_dest'],
                'Sec-Fetch-Mode': browser['sec_fetch_mode'],
                'Sec-Fetch-Site': browser['sec_fetch_site'],
                'Sec-Fetch-User': browser['sec_fetch_user'],
                'Sec-CH-UA': '"Not_A Brand";v="8", "Chromium";v="120"',
                'Sec-CH-UA-Mobile': '?0',
                'Sec-CH-UA-Platform': '"Windows"'
            })

        # Randomly omit some optional headers to add variation
        if random.random() < 0.3:  # 30% chance to omit DNT
            headers.pop('DNT', None)

        if random.random() < 0.2:  # 20% chance to omit Upgrade-Insecure-Requests
            headers.pop('Upgrade-Insecure-Requests', None)

        return headers

    def _create_session(self, proxy_string: str = None) -> requests.Session:
        """Create requests session with proxy and dynamic headers"""
        session = requests.Session()

        # Set dynamic, realistic headers with fingerprinting evasion
        headers = self._generate_browser_headers()
        session.headers.update(headers)

        # Log the browser type being used (for debugging)
        user_agent = headers.get('User-Agent', '')
        if 'Firefox' in user_agent:
            browser_type = 'Firefox'
        elif 'Edg/' in user_agent:
            browser_type = 'Edge'
        else:
            browser_type = 'Chrome'

        logger.debug(f"Using {browser_type} fingerprint")

        # Set proxy if provided
        if proxy_string:
            try:
                proxy_dict = self.proxy_manager.format_proxy_for_requests(proxy_string)
                session.proxies.update(proxy_dict)
                logger.info(f"Using proxy: {proxy_string.split('@')[0] if '@' in proxy_string else proxy_string.split(':')[0]}")
            except Exception as e:
                logger.warning(f"Failed to set proxy {proxy_string}: {e}")

        return session

    def _add_navigation_headers(self, session: requests.Session, url: str):
        """Add realistic navigation headers like referer for internal requests"""
        # Add referer for book.qq.com internal navigation
        if 'book.qq.com' in url:
            # Simulate coming from the main site or search
            referers = [
                'https://book.qq.com/',
                'https://book.qq.com/search',
                'https://book.qq.com/category',
                'https://www.qq.com/',
                'https://www.google.com/'
            ]
            session.headers['Referer'] = random.choice(referers)

    def _generate_api_headers(self) -> Dict[str, str]:
        """Generate headers suitable for API requests (not HTML page loads)"""
        headers = self._generate_browser_headers()
        # Override for API-specific headers
        headers['Accept'] = 'application/json, text/plain, */*'
        headers['Sec-Fetch-Dest'] = 'empty'
        headers['Sec-Fetch-Mode'] = 'cors'
        headers['Sec-Fetch-Site'] = 'same-origin'
        headers.pop('Sec-Fetch-User', None)
        headers.pop('Upgrade-Insecure-Requests', None)
        headers['Referer'] = 'https://book.qq.com/'
        return headers

    def _scrape_comments(self, session: requests.Session, bid: str) -> list:
        """Paginate through the comment API and collect all comments"""
        all_comments = []
        cursor = ''
        max_pages = 500  # Safety limit: 500 pages * 20 = 10,000 comments
        timeout = config.crawler['request_timeout']
        empty_page_retries = 0
        max_empty_retries = 2

        # Set API-specific headers
        api_headers = self._generate_api_headers()
        session.headers.update(api_headers)

        for page in range(max_pages):
            try:
                url = f"https://book.qq.com/api/bookcomment/list?bid={bid}&cursor={cursor}"
                response = session.get(url, timeout=timeout)
                response.raise_for_status()

                data = response.json()

                if data.get('code') != 0:
                    logger.warning(f"Comment API error at page {page + 1}: code={data.get('code')}, msg={data.get('msg')}")
                    break

                comments = data.get('data', {}).get('comments', [])
                if not comments:
                    empty_page_retries += 1
                    if empty_page_retries > max_empty_retries:
                        break
                    time.sleep(random.uniform(1.0, 2.0))
                    continue

                empty_page_retries = 0
                all_comments.extend(comments)

                # Get next cursor
                new_cursor = str(data.get('data', {}).get('cursor', ''))
                if not new_cursor or new_cursor == '0' or new_cursor == cursor:
                    break
                cursor = new_cursor

                time.sleep(random.uniform(0.5, 1.5))

            except requests.RequestException as e:
                logger.warning(f"Comment API request failed at page {page + 1}: {e}")
                time.sleep(random.uniform(2.0, 4.0))
                empty_page_retries += 1
                if empty_page_retries > max_empty_retries:
                    break
                continue
            except (json.JSONDecodeError, KeyError) as e:
                logger.warning(f"Failed to parse comment API response at page {page + 1}: {e}")
                break

        logger.info(f"Scraped {len(all_comments)} comments for bid {bid}")
        return all_comments

    def _save_comments_to_database(self, book_id: int, comments_data: list) -> int:
        """Upsert QQUser + BookComment records, update Book.last_comments_scraped_at"""
        saved_count = 0

        try:
            with db_manager.get_session() as session:
                # Prefetch all UIDs and existing comments for this book
                all_uids = set()
                for c in comments_data:
                    uid = str(c.get('user', {}).get('uid', ''))
                    if uid:
                        all_uids.add(uid)

                # Batch load existing users
                uid_to_user = {}
                if all_uids:
                    existing_users = session.query(QQUser).filter(QQUser.uid.in_(all_uids)).all()
                    uid_to_user = {u.uid: u for u in existing_users}

                # Batch load existing comments for this book (keyed by user_id + timestamp)
                existing_comments_rows = session.query(BookComment).filter(
                    BookComment.book_id == book_id
                ).all()
                existing_comments_map = {
                    (c.qq_user_id, c.comment_created_at): c for c in existing_comments_rows
                }


                for comment_raw in comments_data:
                    try:
                        # Extract user info
                        user_info = comment_raw.get('user', {})
                        uid = str(user_info.get('uid', ''))
                        if not uid:
                            continue

                        # Upsert QQUser
                        raw_icon = user_info.get('icon', '')
                        qq_user = uid_to_user.get(uid)
                        if not qq_user:
                            try:
                                qq_user = QQUser(
                                    uid=uid,
                                    nickname=user_info.get('nickname', ''),
                                    icon_url=raw_icon,
                                    is_author=user_info.get('isAuthor', 0),
                                    center_author_id=user_info.get('centerAuthorId', 0)
                                )
                                session.add(qq_user)
                                session.flush()
                                # Avatar uploads to R2 disabled — using QQ CDN links directly
                            except Exception:
                                session.rollback()
                                qq_user = uid_to_user.get(uid) or session.query(QQUser).filter(QQUser.uid == uid).first()
                                if not qq_user:
                                    continue
                            uid_to_user[uid] = qq_user
                        else:
                            # Update nickname if changed
                            if user_info.get('nickname'):
                                qq_user.nickname = user_info['nickname']
                            # Avatar uploads to R2 disabled — using QQ CDN links directly

                        # Parse comment timestamp (epoch ms)
                        comment_created_at = None
                        create_time = comment_raw.get('createTime', 0)
                        if create_time:
                            try:
                                comment_created_at = datetime.fromtimestamp(
                                    int(create_time) / 1000, tz=timezone.utc
                                )
                            except (ValueError, OSError):
                                pass

                        # Serialize images list
                        images_list = comment_raw.get('images', [])
                        images_json = json.dumps(images_list) if images_list else None

                        # Dedup by book + user + timestamp (using prefetched map)
                        existing_comment = existing_comments_map.get((qq_user.id, comment_created_at))

                        if not existing_comment:
                            book_comment = BookComment(
                                book_id=book_id,
                                qq_user_id=qq_user.id,
                                title=_clean_comment_text(comment_raw.get('title', '')),
                                content=_clean_comment_text(comment_raw.get('content', '')),
                                images=images_json,
                                agree_count=comment_raw.get('agreeCount', 0),
                                reply_count=comment_raw.get('replyCount', 0),
                                comment_created_at=comment_created_at
                            )
                            session.add(book_comment)
                            saved_count += 1
                        else:
                            # Update engagement counts
                            existing_comment.agree_count = comment_raw.get('agreeCount', 0)
                            existing_comment.reply_count = comment_raw.get('replyCount', 0)
                            # Detect content edits — update text and clear stale translation
                            new_content = _clean_comment_text(comment_raw.get('content', ''))
                            if new_content and new_content != existing_comment.content:
                                existing_comment.content = new_content
                                existing_comment.content_translated = None
                            new_title = _clean_comment_text(comment_raw.get('title', ''))
                            if new_title and new_title != existing_comment.title:
                                existing_comment.title = new_title
                                existing_comment.title_translated = None

                    except Exception as e:
                        logger.warning(f"Failed to save comment: {e}")
                        continue

                # Update book's last_comments_scraped_at
                book = session.query(Book).filter(Book.id == book_id).first()
                if book:
                    book.last_comments_scraped_at = datetime.now(timezone.utc)

                session.commit()
                logger.info(f"Saved {saved_count} new comments for book {book_id}")

            # Avatar uploads to R2 disabled — using QQ CDN links directly

        except Exception as e:
            logger.error(f"Failed to save comments to database: {e}")

        return saved_count

    def _parse_nuxt_data(self, soup: BeautifulSoup) -> Optional[Dict[str, Any]]:
        """Extract structured book data from window.__NUXT__ script tag"""
        for script in soup.find_all('script'):
            text = script.string or ''
            if 'window.__NUXT__' not in text:
                continue

            # Build variable map from function(params){...}(args)
            fn_match = re.search(r'window\.__NUXT__=\(function\(([^)]+)\)', text)
            invoke_match = re.search(r'\}\(([^)]+)\)\)\s*;?\s*$', text.strip())
            var_map = {}

            if fn_match and invoke_match:
                params = fn_match.group(1).split(',')
                args_raw = invoke_match.group(1)
                args = []
                i = 0
                while i < len(args_raw):
                    c = args_raw[i]
                    if c == '"':
                        j = i + 1
                        while j < len(args_raw):
                            if args_raw[j] == '\\' and j + 1 < len(args_raw):
                                j += 2
                            elif args_raw[j] == '"':
                                break
                            else:
                                j += 1
                        args.append(args_raw[i:j+1])
                        i = j + 2
                    elif c == '{':
                        depth = 1
                        j = i + 1
                        while j < len(args_raw) and depth > 0:
                            if args_raw[j] == '{':
                                depth += 1
                            elif args_raw[j] == '}':
                                depth -= 1
                            j += 1
                        args.append(args_raw[i:j])
                        i = j + 1
                    elif c == ',':
                        i += 1
                    elif c == ' ':
                        i += 1
                    else:
                        j = i
                        while j < len(args_raw) and args_raw[j] != ',':
                            j += 1
                        args.append(args_raw[i:j])
                        i = j + 1

                for idx, param in enumerate(params):
                    if idx < len(args):
                        val = args[idx]
                        if val == 'true':
                            val = True
                        elif val == 'false':
                            val = False
                        elif val == 'null':
                            val = None
                        elif val.startswith('"') and val.endswith('"'):
                            val = val[1:-1].replace('\\n', '\n').replace('\\r', '\r').replace('\\u002F', '/')
                        else:
                            try:
                                val = int(val)
                            except ValueError:
                                try:
                                    val = float(val)
                                except ValueError:
                                    pass
                        var_map[param] = val

            def resolve(key):
                if key in var_map:
                    return var_map[key]
                if key == 'true':
                    return True
                if key == 'false':
                    return False
                if key in ('null', 'void 0'):
                    return None
                try:
                    return int(key)
                except ValueError:
                    try:
                        return float(key)
                    except ValueError:
                        return key

            # Extract the bookInfo:{...} block (identified by scoreNumText)
            book_info_match = re.search(r'bookInfo:\{([^}]+scoreNumText[^}]+)\}', text)
            if not book_info_match:
                return None

            block = book_info_match.group(1)
            result = {}
            for m in re.finditer(r'(\w+):(?:"([^"]*)"|([\w.]+))', block):
                key = m.group(1)
                if m.group(2) is not None:
                    result[key] = m.group(2)
                else:
                    result[key] = resolve(m.group(3))

            # Extract recommendation bids from sameCategoryRec
            all_dot_bids = re.findall(r'\.bid=(\d+)', text)
            rec_start = text.find('sameCategoryRec')
            rec_inline_bids = re.findall(r'bid:(\d+)', text[rec_start:]) if rec_start >= 0 else []
            main_bid = str(result.get('bid', ''))
            seen = set()
            rec_ids = []
            for b in all_dot_bids + rec_inline_bids:
                if b not in seen and b != main_bid:
                    seen.add(b)
                    rec_ids.append(int(b))
            result['recommendation_bids'] = rec_ids

            return result

        return None

    def _scrape_book_data(self, session: requests.Session, url: str) -> Dict[str, Any]:
        """Extract book data from HTML, preferring __NUXT__ structured data"""
        # Add realistic navigation headers
        self._add_navigation_headers(session, url)

        timeout = config.crawler['request_timeout']
        response = session.get(url, timeout=timeout)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, 'lxml')

        # Initialize book data structure
        book_data = {
            'url': url,
            'title': '',
            'author': '',
            'synopsis': '',
            'image_url': '',
            'genre': '',
            'subgenre': '',
            'chapters': []
        }

        # Try to extract from __NUXT__ first (more reliable)
        nuxt = self._parse_nuxt_data(soup)
        if nuxt:
            logger.info(f"Extracted NUXT data for bid={nuxt.get('bid')}")
            book_data['title'] = nuxt.get('title', '')
            book_data['author'] = nuxt.get('author', '')
            book_data['synopsis'] = nuxt.get('intro', '')
            book_data['genre'] = nuxt.get('category2Name', '')
            book_data['subgenre'] = nuxt.get('category3Name', '')
            if nuxt.get('updateTime'):
                book_data['update_time'] = nuxt['updateTime']

            # New fields from NUXT
            total_words = nuxt.get('totalWords')
            if isinstance(total_words, int):
                book_data['word_count'] = total_words
            else:
                book_data['word_count'] = 0  # Could not resolve from minified NUXT

            finished = nuxt.get('finished')
            if finished == 1 or finished is True:
                book_data['status'] = 'completed'
            elif finished == 0 or finished is False:
                book_data['status'] = 'ongoing'
            else:
                book_data['status'] = 'unknown'  # Could not resolve from minified NUXT

            sex_attr = nuxt.get('sexAttr')
            if isinstance(sex_attr, int):
                book_data['sex_attr'] = sex_attr
            else:
                book_data['sex_attr'] = 0  # Could not resolve from minified NUXT

            score = nuxt.get('score')
            if score and score != '0.0':
                try:
                    float(score)
                    book_data['qq_score'] = score
                except (ValueError, TypeError):
                    book_data['qq_score'] = '0'  # Non-numeric (minified var) — mark as no rating
            else:
                book_data['qq_score'] = '0'  # No rating on QQ

            score_num = nuxt.get('scoreNum')
            if isinstance(score_num, int) and score_num > 0:
                book_data['qq_score_count'] = score_num
            else:
                # Try parsing from scoreNumText ("3871人评分")
                score_text = nuxt.get('scoreNumText', '')
                if score_text:
                    sn_match = re.search(r'(\d+)', str(score_text))
                    if sn_match:
                        book_data['qq_score_count'] = int(sn_match.group(1))
                    else:
                        book_data['qq_score_count'] = 0
                else:
                    book_data['qq_score_count'] = 0

            favor = nuxt.get('favorCount')
            if isinstance(favor, int) and favor > 0:
                book_data['qq_favorite_count'] = favor
            else:
                book_data['qq_favorite_count'] = 0

            fans = nuxt.get('fansCount')
            if isinstance(fans, int) and fans > 0:
                book_data['qq_fan_count'] = fans
            else:
                book_data['qq_fan_count'] = 0

            rec_bids = nuxt.get('recommendation_bids', [])
            if rec_bids:
                book_data['recommendation_qq_ids'] = rec_bids

        # Fallback: extract title from HTML <title> tag if NUXT didn't provide it
        if not book_data['title']:
            title_elem = soup.find('title')
            if title_elem:
                title_text = title_elem.get_text(strip=True)
                clean_title = re.sub(r'_(.*?)小说最新章节全文免费在线阅读下载-QQ阅读', '', title_text).strip()
                book_data['title'] = clean_title

        # Fallback: extract author from HTML if NUXT didn't provide it
        if not book_data['author']:
            title_elem = soup.find('title')
            if title_elem:
                title_text = title_elem.get_text(strip=True)
                author_match = re.search(r'_\((.*?)\)小说', title_text)
                if author_match:
                    book_data['author'] = author_match.group(1)
            if not book_data['author']:
                author_elem = soup.find(class_='book-author')
                if author_elem:
                    book_data['author'] = author_elem.get_text(strip=True)

        # Fallback: extract update time from HTML
        if not book_data.get('update_time'):
            update_elem = soup.find(class_='update-time')
            if update_elem:
                update_text = update_elem.get_text(strip=True)
                book_data['update_time'] = update_text.replace('更新时间：', '').strip()

        # Fallback: extract synopsis from HTML
        if not book_data['synopsis']:
            for selector in ['.book-intro', '.chapter-content', '.book-desc']:
                synopsis_elem = soup.select(selector)
                if synopsis_elem:
                    book_data['synopsis'] = synopsis_elem[0].get_text(strip=True)
                    break

        # Extract image URL from HTML (always, since NUXT cover is often null)
        img_selectors = ['.book-cover img', '.ypc-book-cover']
        for selector in img_selectors:
            img_elem = soup.select(selector)
            if img_elem and img_elem[0].get('src'):
                book_data['image_url'] = img_elem[0]['src']
                break

        # Fallback: extract tags for genre/subgenre from HTML
        if not book_data['genre']:
            tags = []
            for selector in ['.tag', '.book-tag', '.label']:
                tag_elems = soup.select(selector)
                for elem in tag_elems:
                    tag_text = elem.get_text(strip=True)
                    if tag_text:
                        tags.append(tag_text)
            book_data['genre'] = tags[0] if len(tags) > 0 else ''
            book_data['subgenre'] = tags[1] if len(tags) > 1 else ''

        # Extract chapters from HTML
        chapters_map = {}
        chapter_selectors = ['ul.book-dir li.list', '.book-chapter li']

        for selector in chapter_selectors:
            chapter_elems = soup.select(selector)
            for i, elem in enumerate(chapter_elems):
                link = elem.find('a')
                if link:
                    name_elem = link.find(class_='name')
                    chapter_title = name_elem.get_text(strip=True) if name_elem else link.get_text(strip=True)
                    chapter_href = link.get('href', '')

                    if chapter_title and chapter_href:
                        # Extract chapter number
                        chapter_number_from_url = re.search(r'/(\d+)$', chapter_href)
                        chapter_number_from_title = re.search(r'第(\d+)章', chapter_title)

                        if chapter_number_from_url:
                            chapter_number = int(chapter_number_from_url.group(1))
                        elif chapter_number_from_title:
                            chapter_number = int(chapter_number_from_title.group(1))
                        else:
                            chapter_number = i + 1

                        # Clean chapter title
                        clean_title = re.sub(r'第\d+章\s*', '', chapter_title).strip()

                        # Build full URL
                        if chapter_href.startswith('//'):
                            full_url = f"https:{chapter_href}"
                        elif chapter_href.startswith('/'):
                            full_url = f"https://book.qq.com{chapter_href}"
                        else:
                            full_url = chapter_href

                        chapters_map[chapter_number] = {
                            'number': chapter_number,
                            'title': clean_title,
                            'url': full_url
                        }

        book_data['chapters'] = sorted(chapters_map.values(), key=lambda x: x['number'])

        return book_data

    def _save_to_database(self, book_data: Dict[str, Any]) -> Optional[int]:
        """Save scraped book data to PostgreSQL"""
        try:
            with db_manager.get_session() as session:
                # Find or create genre (validate name first)
                genre_id = None
                genre_name = book_data.get('genre', '')
                if genre_name and _is_valid_genre_name(genre_name):
                    genre = session.query(Genre).filter(Genre.name == genre_name).first()
                    if not genre:
                        genre = Genre(name=genre_name)
                        session.add(genre)
                        session.flush()
                    genre_id = genre.id

                    # Skip blacklisted genres — but save genre_id so maintenance won't re-queue
                    if genre.blacklisted:
                        existing = session.query(Book).filter(Book.url == book_data['url']).first()
                        if existing and not existing.genre_id:
                            existing.genre_id = genre_id
                            session.commit()
                        logger.info(f"Skipping blacklisted genre '{genre_name}' for {book_data.get('url', 'unknown')}")
                        return None
                elif genre_name:
                    logger.debug(f"Rejected invalid genre name '{genre_name}' for {book_data.get('url', 'unknown')}")

                # Find or create subgenre (validate name first)
                subgenre_id = None
                subgenre_name = book_data.get('subgenre', '')
                if subgenre_name and _is_valid_genre_name(subgenre_name):
                    subgenre = session.query(Genre).filter(Genre.name == subgenre_name).first()
                    if not subgenre:
                        subgenre = Genre(name=subgenre_name)
                        session.add(subgenre)
                        session.flush()
                    subgenre_id = subgenre.id
                elif subgenre_name:
                    logger.debug(f"Rejected invalid subgenre name '{subgenre_name}' for {book_data.get('url', 'unknown')}")

                # Upsert book
                existing_book = session.query(Book).filter(Book.url == book_data['url']).first()

                if existing_book:
                    # Update existing book - only update missing fields to preserve existing data
                    updated_fields = []

                    if not existing_book.title or existing_book.title == '':
                        existing_book.title = book_data['title']
                        updated_fields.append('title')

                    if not existing_book.author or existing_book.author == '':
                        existing_book.author = book_data['author']
                        updated_fields.append('author')

                    if not existing_book.synopsis or existing_book.synopsis == '':
                        existing_book.synopsis = book_data['synopsis']
                        updated_fields.append('synopsis')

                    # Always update image_url, genre, and metadata if they come from scraping
                    if book_data.get('image_url'):
                        existing_book.image_url = book_data['image_url']
                        updated_fields.append('image_url')

                    if genre_id:
                        existing_book.genre_id = genre_id
                        updated_fields.append('genre')

                    if subgenre_id:
                        existing_book.subgenre_id = subgenre_id
                        updated_fields.append('subgenre')

                    # Always update NUXT-sourced fields (they reflect current state)
                    if book_data.get('word_count') is not None:
                        existing_book.word_count = book_data['word_count']
                    if book_data.get('status'):
                        existing_book.status = book_data['status']
                    if book_data.get('sex_attr') is not None:
                        existing_book.sex_attr = book_data['sex_attr']
                    if book_data.get('qq_score'):
                        existing_book.qq_score = book_data['qq_score']
                    if book_data.get('qq_score_count') is not None:
                        existing_book.qq_score_count = book_data['qq_score_count']
                    if book_data.get('qq_favorite_count') is not None:
                        existing_book.qq_favorite_count = book_data['qq_favorite_count']
                    if book_data.get('qq_fan_count') is not None:
                        existing_book.qq_fan_count = book_data['qq_fan_count']
                    if book_data.get('recommendation_qq_ids'):
                        existing_book.recommendation_qq_ids = book_data['recommendation_qq_ids']

                    existing_book.last_scraped_at = datetime.now(timezone.utc)
                    existing_book.updated_at = datetime.now(timezone.utc)

                    if updated_fields:
                        logger.info(f"Updated missing fields for book {existing_book.id}: {', '.join(updated_fields)}")

                    book = existing_book
                else:
                    # Create new book
                    book = Book(
                        url=book_data['url'],
                        title=book_data['title'],
                        author=book_data['author'],
                        synopsis=book_data['synopsis'],
                        image_url=book_data['image_url'],
                        # update_time will be parsed and set from scraped data if available
                        genre_id=genre_id,
                        subgenre_id=subgenre_id,
                        word_count=book_data.get('word_count'),
                        status=book_data.get('status'),
                        sex_attr=book_data.get('sex_attr'),
                        qq_score=book_data.get('qq_score'),
                        qq_score_count=book_data.get('qq_score_count'),
                        qq_favorite_count=book_data.get('qq_favorite_count'),
                        qq_fan_count=book_data.get('qq_fan_count'),
                        recommendation_qq_ids=book_data.get('recommendation_qq_ids'),
                        last_scraped_at=datetime.now(timezone.utc)
                    )
                    session.add(book)

                # Parse and set update_time from scraped data if available
                if book_data.get('update_time'):
                    try:
                        # Parse the Chinese date format: "2025-09-23 23:15:25" (China time, UTC+8)
                        update_time_str = book_data['update_time']
                        parsed_time = datetime.strptime(update_time_str, '%Y-%m-%d %H:%M:%S')
                        # Qidian times are China Standard Time (UTC+8) — convert to UTC
                        cst = timezone(timedelta(hours=8))
                        book.update_time = parsed_time.replace(tzinfo=cst).astimezone(timezone.utc)
                        logger.info(f"Set update_time for book {book.id}: {book.update_time}")
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Failed to parse update_time '{book_data.get('update_time')}': {e}")

                session.flush()
                book_id = book.id

                # Create chapters (batch check existing URLs)
                chapters_created = 0
                chapters_list = book_data.get('chapters', [])
                if chapters_list:
                    chapter_urls = [ch['url'] for ch in chapters_list]
                    existing_urls = set(
                        url for (url,) in session.query(Chapter.url).filter(
                            Chapter.url.in_(chapter_urls)
                        ).all()
                    )
                    for chapter_data in chapters_list:
                        if chapter_data['url'] not in existing_urls:
                            chapter = Chapter(
                                book_id=book_id,
                                sequence_number=chapter_data['number'],
                                title=chapter_data['title'],
                                url=chapter_data['url']
                            )
                            session.add(chapter)
                            chapters_created += 1

                session.commit()
                logger.info(f"Saved book ID {book_id}, {chapters_created} new chapters")

                # Upload cover image to R2
                if book_data.get('image_url') and not book_data['image_url'].startswith(config.r2.get('public_url') or ''):
                    try:
                        result = upload_book_image(book_id, book_data['image_url'])
                        if result.get('status') == 'ok':
                            logger.info(f"Uploaded cover image for book {book_id} to R2")
                    except Exception as e:
                        logger.warning(f"Failed to upload cover to R2 for book {book_id}, keeping original URL: {e}")

                return book_id

        except Exception as e:
            logger.error(f"Database save error: {e}")
            return None

def scrape_and_save(url: str) -> dict:
    """
    Main worker function that:
    1. Checks if URL already exists in database
    2. Scrapes book data from URL (if needed)
    3. Saves to PostgreSQL database
    4. Queues translation job if needed
    """
    scraper = BookScraper()

    # Check if URL already exists in database
    try:
        with db_manager.get_session() as session:
            existing_book = session.query(Book).filter(Book.url == url).first()

            if existing_book:
                logger.info(f"Book already exists in database: {existing_book.id} - {existing_book.title}")

                # Check if any fields are missing and need to be updated
                missing_fields = []
                if not existing_book.title or existing_book.title == '':
                    missing_fields.append('title')
                if not existing_book.author or existing_book.author == '':
                    missing_fields.append('author')
                if not existing_book.synopsis or existing_book.synopsis == '':
                    missing_fields.append('synopsis')
                if existing_book.word_count is None:
                    missing_fields.append('word_count')
                if existing_book.status is None:
                    missing_fields.append('status')
                if existing_book.sex_attr is None:
                    missing_fields.append('sex_attr')
                if existing_book.qq_score is None:
                    missing_fields.append('qq_score')
                if existing_book.qq_score_count is None:
                    missing_fields.append('qq_score_count')
                if existing_book.qq_favorite_count is None:
                    missing_fields.append('qq_favorite_count')
                if existing_book.qq_fan_count is None:
                    missing_fields.append('qq_fan_count')

                if missing_fields:
                    logger.info(f"Book {existing_book.id} has missing fields: {', '.join(missing_fields)}. Re-scraping to update.")
                    # Continue with scraping to update missing fields
                else:
                    # All fields are present, just queue translation if needed
                    scraper.queue_manager.add_translation_job(existing_book.id)

                    # Queue comment scraping if never scraped
                    if not existing_book.last_comments_scraped_at:
                        try:
                            scraper.queue_manager.add_comment_scrape_job(url, existing_book.id)
                            logger.info(f"Queued comment scraping for existing book {existing_book.id}")
                        except Exception as e:
                            logger.warning(f"Failed to queue comment scraping: {e}")

                    return {
                        'success': True,
                        'book_id': existing_book.id,
                        'url': url,
                        'message': 'Book already exists with complete data, skipped scraping',
                        'chapters_processed': 0
                    }
    except Exception as e:
        logger.warning(f"Error checking existing book: {e}, proceeding with scrape")

    max_retries = 3

    for attempt in range(max_retries):
        try:
            logger.info(f"Scraping {url} (attempt {attempt + 1}/{max_retries})")

            # Get proxy
            proxy = scraper.proxy_manager.get_next_proxy()
            session = scraper._create_session(proxy)

            # Scrape book data
            book_data = scraper._scrape_book_data(session, url)

            # Save to database
            book_id = scraper._save_to_database(book_data)

            if book_id:
                # Queue translation job
                scraper.queue_manager.add_translation_job(book_id)

                # Queue comment scraping
                try:
                    scraper.queue_manager.add_comment_scrape_job(url, book_id)
                    logger.info(f"Queued comment scraping for book {book_id}")
                except Exception as e:
                    logger.warning(f"Failed to queue comment scraping: {e}")

                return {
                    'success': True,
                    'book_id': book_id,
                    'chapters_count': len(book_data.get('chapters', [])),
                    'attempt': attempt + 1
                }

        except requests.RequestException as e:
            logger.warning(f"Request error on attempt {attempt + 1}: {e}")
            if attempt < max_retries - 1:
                # Retry with next proxy
                time.sleep(2)
                continue

        except Exception as e:
            logger.error(f"Scraping error: {e}")
            break

    return {
        'success': False,
        'error': 'Failed after all retry attempts',
        'attempts': max_retries
    }

def refresh_book(url: str, book_id: int) -> dict:
    """
    Lightweight refresh task - check for updates and new chapters
    """
    scraper = BookScraper()

    # Get current book data from database
    try:
        with db_manager.get_session() as session:
            existing_book = session.query(Book).filter(Book.id == book_id).first()
            if not existing_book:
                return {
                    'success': False,
                    'error': 'Book not found in database',
                    'book_id': book_id
                }

            # Store current state for comparison
            existing_chapter_urls = {ch.url for ch in existing_book.chapters}

    except Exception as e:
        logger.error(f"Failed to get existing book data for {book_id}: {e}")
        return {
            'success': False,
            'error': f'Database error: {e}',
            'book_id': book_id
        }

    # Scrape fresh data
    max_retries = 2  # Fewer retries for refresh
    for attempt in range(max_retries):
        try:
            logger.info(f"Refreshing book {book_id} from {url} (attempt {attempt + 1}/{max_retries})")

            # Get proxy and scrape
            proxy = scraper.proxy_manager.get_next_proxy()
            session = scraper._create_session(proxy)
            fresh_data = scraper._scrape_book_data(session, url)

            # Compare and update all scraped fields
            changes_detected = []
            new_chapters = []
            translation_needed = False

            with db_manager.get_session() as db_session:
                book = db_session.query(Book).filter(Book.id == book_id).first()

                # Check and update all scraped fields from fresh_data
                if fresh_data.get('title') and fresh_data['title'] != book.title:
                    book.title = fresh_data['title']
                    # Clear translation if field changed
                    book.title_translated = None
                    changes_detected.append('title')
                    translation_needed = True

                if fresh_data.get('author') and fresh_data['author'] != book.author:
                    book.author = fresh_data['author']
                    # Clear translation if field changed
                    book.author_translated = None
                    changes_detected.append('author')
                    translation_needed = True

                if fresh_data.get('synopsis') and fresh_data['synopsis'] != book.synopsis:
                    book.synopsis = fresh_data['synopsis']
                    # Clear translation if field changed
                    book.synopsis_translated = None
                    changes_detected.append('synopsis')
                    translation_needed = True

                if fresh_data.get('image_url') and fresh_data['image_url'] != book.image_url:
                    # Upload to R2, fall back to original URL
                    r2_public = config.r2.get('public_url') or ''
                    if not fresh_data['image_url'].startswith(r2_public):
                        try:
                            result = upload_book_image(book_id, fresh_data['image_url'])
                            if result.get('status') == 'ok':
                                logger.info(f"Uploaded refreshed cover for book {book_id} to R2")
                                # upload_book_image already updates the DB, skip setting here
                            else:
                                book.image_url = fresh_data['image_url']
                        except Exception as e:
                            logger.warning(f"Failed to upload cover to R2 for book {book_id}: {e}")
                            book.image_url = fresh_data['image_url']
                    else:
                        book.image_url = fresh_data['image_url']
                    changes_detected.append('image_url')

                # Check and update update_time from scraped data
                if fresh_data.get('update_time'):
                    try:
                        # Parse the Chinese date format: "2025-09-23 23:15:25" (China time, UTC+8)
                        update_time_str = fresh_data['update_time']
                        parsed_time = datetime.strptime(update_time_str, '%Y-%m-%d %H:%M:%S')
                        # Qidian times are China Standard Time (UTC+8) — convert to UTC
                        cst = timezone(timedelta(hours=8))
                        new_update_time = parsed_time.replace(tzinfo=cst).astimezone(timezone.utc)

                        # Only update if different
                        if book.update_time != new_update_time:
                            book.update_time = new_update_time
                            changes_detected.append('update_time')
                            logger.info(f"Updated update_time for book {book_id}: {book.update_time}")
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Failed to parse update_time '{fresh_data.get('update_time')}': {e}")

                # Check genre changes (if we have valid genre data)
                fresh_genre = fresh_data.get('genre', '')
                if fresh_genre and _is_valid_genre_name(fresh_genre):
                    current_genre_name = book.genre.name if book.genre else ''
                    if fresh_genre != current_genre_name:
                        genre = db_session.query(Genre).filter(Genre.name == fresh_genre).first()
                        if not genre:
                            genre = Genre(name=fresh_genre)
                            db_session.add(genre)
                            db_session.flush()

                        book.genre_id = genre.id
                        changes_detected.append('genre')

                # Check subgenre changes (if we have valid subgenre data)
                fresh_subgenre = fresh_data.get('subgenre', '')
                if fresh_subgenre and _is_valid_genre_name(fresh_subgenre):
                    current_subgenre_name = book.subgenre.name if book.subgenre else ''
                    if fresh_subgenre != current_subgenre_name:
                        subgenre = db_session.query(Genre).filter(Genre.name == fresh_subgenre).first()
                        if not subgenre:
                            subgenre = Genre(name=fresh_subgenre)
                            db_session.add(subgenre)
                            db_session.flush()

                        book.subgenre_id = subgenre.id
                        changes_detected.append('subgenre')

                # Check for new chapters
                for ch_data in fresh_data.get('chapters', []):
                    if ch_data['url'] not in existing_chapter_urls:
                        new_chapter = Chapter(
                            book_id=book_id,
                            sequence_number=ch_data['number'],
                            title=ch_data['title'],
                            url=ch_data['url']
                        )
                        db_session.add(new_chapter)
                        new_chapters.append(ch_data)

                # Always update last_scraped_at
                book.last_scraped_at = datetime.now(timezone.utc)
                if changes_detected or new_chapters:
                    book.updated_at = datetime.now(timezone.utc)

                db_session.commit()

            # Notify bookmarkers about new chapters
            if new_chapters:
                try:
                    with db_manager.get_session() as notif_session:
                        # Get all bookmarkers for this book
                        bookmarker_ids = [
                            row.user_id for row in
                            notif_session.query(Bookmark.user_id).filter(Bookmark.book_id == book_id).all()
                        ]

                        if bookmarker_ids:
                            # Deduplicate: check if new_chapters notification for same book exists in last hour
                            one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
                            existing = notif_session.query(Notification.user_id).filter(
                                Notification.type == 'new_chapters',
                                Notification.user_id.in_(bookmarker_ids),
                                Notification.created_at >= one_hour_ago,
                            ).all()
                            existing_user_ids = {row.user_id for row in existing}

                            # Check disabled preferences
                            disabled = notif_session.query(NotificationPreference.user_id).filter(
                                NotificationPreference.user_id.in_(bookmarker_ids),
                                NotificationPreference.type == 'new_chapters',
                                NotificationPreference.enabled == False,  # noqa: E712 — SQLAlchemy requires == for SQL expressions
                            ).all()
                            disabled_user_ids = {row.user_id for row in disabled}

                            # Get book title for notification metadata
                            book_obj = notif_session.query(Book).filter(Book.id == book_id).first()
                            book_title = (book_obj.title_translated or book_obj.title or 'Unknown') if book_obj else 'Unknown'

                            metadata = json.dumps({
                                'bookId': book_id,
                                'bookTitle': book_title,
                                'chapterCount': len(new_chapters),
                            })

                            to_notify = [
                                uid for uid in bookmarker_ids
                                if uid not in existing_user_ids and uid not in disabled_user_ids
                            ]

                            # Batch insert in chunks of 1000
                            for i in range(0, len(to_notify), 1000):
                                chunk = to_notify[i:i+1000]
                                notif_session.bulk_save_objects([
                                    Notification(
                                        user_id=uid,
                                        type='new_chapters',
                                        metadata_=metadata,
                                    )
                                    for uid in chunk
                                ])
                            notif_session.commit()
                            logger.info(f"Sent new_chapters notifications to {len(to_notify)} bookmarkers for book {book_id}")
                except Exception as e:
                    logger.warning(f"Failed to send new chapter notifications for book {book_id}: {e}")

            # Queue translations for changes
            jobs_queued = []

            # Queue book translation if content fields changed
            if translation_needed:
                try:
                    scraper.queue_manager.add_translation_job(book_id, 'book')
                    jobs_queued.append('book_translation')
                    logger.info(f"Queued book translation due to field changes: {[f for f in changes_detected if f in ['title', 'author', 'synopsis']]}")
                except Exception as e:
                    logger.warning(f"Failed to queue book translation: {e}")

            # Queue chapter translation for new chapters
            if new_chapters:
                try:
                    scraper.queue_manager.add_translation_job(book_id, 'chapters')
                    jobs_queued.append('chapter_translation')
                    logger.info(f"Queued chapter translation for {len(new_chapters)} new chapters")
                except Exception as e:
                    logger.warning(f"Failed to queue chapter translation: {e}")

            # Queue comment refresh
            try:
                scraper.queue_manager.add_comment_scrape_job(url, book_id)
                jobs_queued.append('comment_scrape')
                logger.info(f"Queued comment refresh for book {book_id}")
            except Exception as e:
                logger.warning(f"Failed to queue comment refresh: {e}")

            return {
                'success': True,
                'book_id': book_id,
                'changes_detected': changes_detected,
                'new_chapters': len(new_chapters),
                'total_chapters': len(fresh_data.get('chapters', [])),
                'translation_jobs_queued': jobs_queued,
                'attempt': attempt + 1
            }

        except requests.RequestException as e:
            logger.warning(f"Refresh request error (attempt {attempt + 1}): {e}")
            if attempt < max_retries - 1:
                time.sleep(2)
                continue

        except Exception as e:
            logger.error(f"Refresh error: {e}")
            break

    return {
        'success': False,
        'error': 'Refresh failed after all attempts',
        'book_id': book_id,
        'attempts': max_retries
    }

def scrape_comments(url: str, book_id: int) -> dict:
    """
    RQ worker entry point: scrape comments for a book via the comment API.
    Extracts bid from URL, paginates comments, saves to DB, and queues translation.
    """
    scraper = BookScraper()

    max_retries = 3
    for attempt in range(max_retries):
        try:
            bid = extract_bid_from_url(url)
            logger.info(f"Scraping comments for book {book_id} (bid={bid}, attempt {attempt + 1}/{max_retries})")

            # Get proxy and create session
            proxy = scraper.proxy_manager.get_next_proxy()
            session = scraper._create_session(proxy)

            # Scrape comments via API
            comments_data = scraper._scrape_comments(session, bid)

            if not comments_data:
                return {
                    'success': True,
                    'book_id': book_id,
                    'comments_scraped': 0,
                    'message': 'No comments found'
                }

            # Save to database
            saved_count = scraper._save_comments_to_database(book_id, comments_data)

            # Queue comment + nickname translation batches
            if saved_count > 0:
                try:
                    from workers.translator import queue_all_comment_translations, queue_all_nickname_translations
                    result = queue_all_comment_translations(book_id)
                    if result['success']:
                        logger.info(f"Queued {result['batches_queued']} comment translation batches for book {book_id}")
                    result = queue_all_nickname_translations(book_id)
                    if result['success']:
                        logger.info(f"Queued {result['batches_queued']} nickname translation batches for book {book_id}")
                except Exception as e:
                    logger.warning(f"Failed to queue comment/nickname translations: {e}")

            return {
                'success': True,
                'book_id': book_id,
                'comments_scraped': len(comments_data),
                'comments_saved': saved_count,
                'attempt': attempt + 1
            }

        except requests.RequestException as e:
            logger.warning(f"Comment scrape request error (attempt {attempt + 1}): {e}")
            if attempt < max_retries - 1:
                time.sleep(2)
                continue

        except Exception as e:
            logger.error(f"Comment scraping error: {e}")
            break

    return {
        'success': False,
        'error': 'Comment scraping failed after all attempts',
        'book_id': book_id,
        'attempts': max_retries
    }