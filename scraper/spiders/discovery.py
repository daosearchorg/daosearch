"""
Full-site discovery crawler using Scrapy.

Crawls book.qq.com following every link, extracts /book-detail/{bid} URLs,
and batch-inserts new ones into the books table. The existing maintenance
pipeline then picks them up automatically.

Optimized for minimal memory: bloom filter dedup, no DOM parsing,
no in-memory URL set, regex-only link extraction, disk-backed request queue.

Dynamic URL tracking: tracks which URL path prefixes yield book links vs
dead ends, storing stats in Redis for later analysis and blocklist creation.
"""

import re
import logging
import tempfile
from urllib.parse import urlparse

import redis
import scrapy
from pybloom_live import ScalableBloomFilter
from scrapy.dupefilters import BaseDupeFilter
from sqlalchemy.dialects.postgresql import insert

from core.config import config
from core.database import db_manager
from core.models import Book
from services.proxy_manager import RedisProxyManager, PROXY_SET_KEY

logger = logging.getLogger(__name__)

BOOK_DETAIL_RE = re.compile(r'/book-detail/(\d+)')
HREF_RE = re.compile(r'href=["\']([^"\']*?book\.qq\.com[^"\']*)["\']', re.IGNORECASE)

# Redis keys for URL prefix tracking
URL_STATS_KEY = 'discovery:url_stats'        # hash: prefix -> hits:misses
URL_BLOCKED_KEY = 'discovery:url_blocked'     # set of auto-blocked prefixes
LAST_DISCOVERY_KEY = 'discovery:last_run'    # timestamp of last completed discovery
LAST_BOOKLIST_DISCOVERY_KEY = 'discovery:booklist:last_run'  # timestamp of last booklist crawl
DISCOVERY_COOLDOWN_DAYS = 7                  # minimum days between discovery runs

# Min samples before a prefix can be auto-blocked
MIN_SAMPLES = 20

# Prefixes that are always blocked — chapter/reader pages, not worth crawling
HARDCODED_BLOCKED = {
    '/book-read', '/book-chapter', '/book-chapter-detail',
    '/kol', '/kol-rec', '/kol-ask', '/kol-list', '/kol-list-rec',
    '/audio-detail', '/book-shelf', '/book-search', '/ask',
    '/book-comment', '/book-comment-detail', '/',
}


def _extract_prefix(url: str) -> str:
    """Extract a path prefix from a URL for tracking.

    Takes only the first path segment.
    e.g. https://book.qq.com/user/12345/posts -> /user
         https://book.qq.com/book-detail/123   -> /book-detail
         https://book.qq.com/kol/abc123        -> /kol
         https://book.qq.com/book-cate/14300   -> /book-cate
         https://book.qq.com/                  -> /
    """
    try:
        path = urlparse(url).path.rstrip('/')
        if not path:
            return '/'
        segments = path.split('/')
        # segments[0] is '' (before leading /), take the first non-empty segment
        for seg in segments[1:]:
            if seg:
                return '/' + seg
        return '/'
    except Exception:
        return '/'

_JOBDIR = tempfile.mkdtemp(prefix='scrapy_discovery_')


# =============================================================================
# Bloom filter dupefilter — ~1.2MB for 1M URLs vs 100MB+ for Scrapy's default
# =============================================================================

class BloomDupeFilter(BaseDupeFilter):
    def __init__(self):
        self.bloom = ScalableBloomFilter(
            initial_capacity=1_000_000,
            error_rate=0.001,
        )

    def request_seen(self, request):
        if request.url in self.bloom:
            return True
        self.bloom.add(request.url)
        return False

    @classmethod
    def from_settings(cls, settings):
        return cls()


# =============================================================================
# Spider
# =============================================================================

class BookDiscoverySpider(scrapy.Spider):
    name = 'book_discovery'
    allowed_domains = ['book.qq.com']
    start_urls = ['https://book.qq.com/']

    custom_settings = {
        'CLOSESPIDER_PAGECOUNT': config.discovery['max_pages'],
        'DOWNLOAD_DELAY': 0,
        'RANDOMIZE_DOWNLOAD_DELAY': False,
        'CONCURRENT_REQUESTS': config.discovery['concurrent_requests'],
        'CONCURRENT_REQUESTS_PER_DOMAIN': config.discovery['concurrent_requests'],
        'DEPTH_LIMIT': 0,
        'ROBOTSTXT_OBEY': False,
        'ITEM_PIPELINES': {'spiders.discovery.BookUrlPipeline': 300},
        'DOWNLOADER_MIDDLEWARES': {'spiders.discovery.ProxyMiddleware': 350},
        'DUPEFILTER_CLASS': 'spiders.discovery.BloomDupeFilter',
        'LOG_LEVEL': 'WARNING',
        'LOG_SHORT_NAMES': True,
        'RETRY_TIMES': 2,
        'DOWNLOAD_TIMEOUT': 30,
        'TELNETCONSOLE_ENABLED': False,
        'LOGSTATS_INTERVAL': 30,

        # --- Memory optimization ---
        'JOBDIR': _JOBDIR,
        'SCHEDULER_DISK_QUEUE': 'scrapy.squeues.PickleFifoDiskQueue',
        'SCHEDULER_MEMORY_QUEUE': 'scrapy.squeues.FifoMemoryQueue',
        'SCHEDULER_PRIORITY_QUEUE': 'scrapy.pqueues.DownloaderAwarePriorityQueue',
        'HTTPCACHE_ENABLED': False,
        # Only need HTML text for regex
        'DOWNLOAD_MAXSIZE': 1024 * 1024,
        'DOWNLOAD_WARNSIZE': 0,
        # Auto-shutdown if memory exceeds limit
        'MEMUSAGE_ENABLED': True,
        'MEMUSAGE_LIMIT_MB': 4096,
        'MEMUSAGE_WARNING_MB': 3072,
        'RESPONSE_CACHE_SIZE': 0,
        'REACTOR_THREADPOOL_MAXSIZE': 20,
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.redis_client = redis.from_url(config.redis['url'])
        # Load blocked prefixes into memory for fast lookup
        self.blocked_prefixes = self.redis_client.smembers(URL_BLOCKED_KEY)
        self.blocked_prefixes = {p.decode() if isinstance(p, bytes) else p for p in self.blocked_prefixes}
        if self.blocked_prefixes:
            logger.info(f"Loaded {len(self.blocked_prefixes)} blocked URL prefixes")

    def _is_blocked(self, url: str) -> bool:
        """Check if a URL's prefix is blocked (hardcoded or auto-detected)."""
        prefix = _extract_prefix(url)
        return prefix in HARDCODED_BLOCKED or prefix in self.blocked_prefixes

    def _track_prefix(self, url: str, had_books: bool):
        """Track hit/miss for a URL prefix in Redis."""
        prefix = _extract_prefix(url)
        if prefix == '/book-detail':
            return  # Don't track book-detail pages themselves

        field = f"{prefix}"
        try:
            raw = self.redis_client.hget(URL_STATS_KEY, field)
            if raw:
                raw = raw.decode() if isinstance(raw, bytes) else raw
                hits, misses = map(int, raw.split(':'))
            else:
                hits, misses = 0, 0

            if had_books:
                hits += 1
            else:
                misses += 1

            self.redis_client.hset(URL_STATS_KEY, field, f"{hits}:{misses}")

            # Auto-block if enough samples and 0% hit rate
            total = hits + misses
            if total >= MIN_SAMPLES and hits == 0:
                self.redis_client.sadd(URL_BLOCKED_KEY, prefix)
                self.blocked_prefixes.add(prefix)
                logger.info(f"Auto-blocked prefix '{prefix}' ({misses} misses, 0 hits)")
        except Exception:
            pass  # Don't let tracking errors break crawling

    def parse(self, response):
        body = response.text

        # Extract book-detail bids via regex (no DOM parsing)
        seen_bids = set()
        for match in BOOK_DETAIL_RE.finditer(body):
            bid = match.group(1)
            if bid not in seen_bids:
                seen_bids.add(bid)
                yield {'url': f'https://book.qq.com/book-detail/{bid}'}

        # Track whether this page had any book links
        self._track_prefix(response.url, had_books=len(seen_bids) > 0)

        # Follow links via regex (no DOM parsing), skip blocked prefixes
        for match in HREF_RE.finditer(body):
            url = match.group(1)
            if url.startswith('//'):
                url = 'https:' + url
            if not self._is_blocked(url):
                yield scrapy.Request(url, callback=self.parse)


# =============================================================================
# Pipeline — batch-inserts new book URLs, dedup via DB not memory
# =============================================================================

class BookUrlPipeline:
    BATCH_SIZE = 200

    def open_spider(self, spider):
        self.buffer = []
        self.new_count = 0

    def process_item(self, item, spider):
        self.buffer.append(item['url'])
        if len(self.buffer) >= self.BATCH_SIZE:
            self._flush_buffer()
        return item

    def _flush_buffer(self):
        if not self.buffer:
            return
        inserted = 0
        with db_manager.get_session() as session:
            for url in self.buffer:
                result = session.execute(
                    insert(Book).values(url=url).on_conflict_do_nothing(
                        index_elements=['url']
                    )
                )
                inserted += result.rowcount
        self.new_count += inserted
        logger.info(f"Batch: {inserted} new / {len(self.buffer)} total (cumulative new: {self.new_count})")
        self.buffer = []

    def close_spider(self, spider):
        self._flush_buffer()
        logger.info(f"Discovery complete: {self.new_count} new books inserted")


# =============================================================================
# Proxy Middleware — uses exclusive discovery proxy pool
# =============================================================================

class ProxyMiddleware:
    @classmethod
    def from_crawler(cls, crawler):
        middleware = cls()
        crawler.signals.connect(middleware.spider_opened, signal=scrapy.signals.spider_opened)
        return middleware

    def spider_opened(self, spider):
        redis_client = redis.from_url(config.redis['url'])
        count = redis_client.scard(PROXY_SET_KEY)
        if count == 0:
            logger.warning("No proxies in discovery pool — requests will go direct")
            self.proxy_manager = None
        else:
            self.proxy_manager = RedisProxyManager(
                redis_client=redis_client,
                pool_key=PROXY_SET_KEY,
            )
            concurrency = min(count, 100)
            spider.crawler.engine.downloader.total_concurrency = concurrency
            spider.crawler.engine.downloader.domain_concurrency = concurrency
            logger.info(f"Discovery proxy pool: {count} proxies (concurrency={concurrency})")

    def process_request(self, request, spider):
        if self.proxy_manager is None:
            return
        try:
            proxy = self.proxy_manager.get_next_proxy()
            formatted = self.proxy_manager.format_proxy_for_requests(proxy)
            request.meta['proxy'] = formatted['http']
        except ValueError:
            pass


# =============================================================================
# Runner
# =============================================================================

def _check_cooldown(redis_client, key: str, label: str) -> bool:
    """Check if enough time has passed since last run. Returns True if should skip."""
    last_run = redis_client.get(key)
    if last_run:
        import time
        last_ts = float(last_run)
        elapsed_days = (time.time() - last_ts) / 86400
        if elapsed_days < DISCOVERY_COOLDOWN_DAYS:
            logger.info(
                f"Skipping {label}: last ran {elapsed_days:.1f} days ago "
                f"(cooldown: {DISCOVERY_COOLDOWN_DAYS} days)"
            )
            return True
    return False


def _mark_completed(redis_client, key: str):
    """Mark a discovery run as completed."""
    import time
    redis_client.set(key, str(time.time()))


def _run_booklist_discovery(redis_client, info_handler):
    """Run booklist discovery if cooldown has elapsed."""
    if _check_cooldown(redis_client, LAST_BOOKLIST_DISCOVERY_KEY, "booklist discovery"):
        return
    try:
        from spiders.booklist_scraper import QidiantuBooklistScraper
        bl_logger = logging.getLogger('spiders.booklist_scraper')
        bl_logger.handlers = [info_handler]
        bl_logger.setLevel(logging.INFO)
        logger.info("Crawling booklist index...")
        scraper = QidiantuBooklistScraper()
        index_data = scraper.crawl_booklist_index(upsert_progressively=True)
        logger.info(f"Booklist index complete: {len(index_data)} booklists found")
        _mark_completed(redis_client, LAST_BOOKLIST_DISCOVERY_KEY)
    except Exception as e:
        logger.warning(f"Booklist index crawl failed: {e}")


def _run_book_discovery(runner, redis_client):
    """Run book discovery crawl via CrawlerRunner if cooldown has elapsed. Returns a Deferred."""
    from twisted.internet import defer

    if _check_cooldown(redis_client, LAST_DISCOVERY_KEY, "book discovery"):
        return defer.succeed(None)

    logger.info(
        f"Starting discovery crawl: max_pages={config.discovery['max_pages']}, "
        f"concurrent={config.discovery['concurrent_requests']}"
    )

    d = runner.crawl(BookDiscoverySpider)
    d.addCallback(lambda _: _mark_completed(redis_client, LAST_DISCOVERY_KEY))
    return d


# How often to wake up and check cooldowns (seconds)
CHECK_INTERVAL = 24 * 3600  # 24 hours


def run_discovery():
    """Long-running discovery process. Uses Twisted reactor + CrawlerRunner so the
    reactor stays alive across multiple crawl cycles (CrawlerProcess.start() can
    only be called once — Twisted's reactor is not restartable)."""
    import scrapy.utils.reactor
    scrapy.utils.reactor.install_reactor('twisted.internet.asyncioreactor.AsyncioSelectorReactor')
    from twisted.internet import reactor, task
    from scrapy.crawler import CrawlerRunner

    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(asctime)s %(name)s %(levelname)s: %(message)s'))
    handler.setLevel(logging.WARNING)
    root.addHandler(handler)
    root.setLevel(logging.WARNING)

    logging.getLogger('scrapy.core.downloader').setLevel(logging.CRITICAL)
    logging.getLogger('scrapy.core.downloader.handlers.http11').setLevel(logging.CRITICAL)
    logging.getLogger('scrapy.core.scraper').setLevel(logging.CRITICAL)

    info_handler = logging.StreamHandler()
    info_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s: %(message)s'))
    info_handler.setLevel(logging.INFO)
    logger.handlers = [info_handler]
    logger.setLevel(logging.INFO)
    stats_logger = logging.getLogger('scrapy.extensions.logstats')
    stats_logger.handlers = [info_handler]
    stats_logger.setLevel(logging.INFO)

    redis_client = redis.from_url(config.redis['url'])
    runner = CrawlerRunner(settings={'LOG_ENABLED': False})

    logger.info(f"Discovery process started (cooldown={DISCOVERY_COOLDOWN_DAYS}d, check every {CHECK_INTERVAL // 3600}h)")

    def run_cycle():
        try:
            _run_booklist_discovery(redis_client, info_handler)
        except Exception as e:
            logger.error(f"Booklist discovery error: {e}")

        d = _run_book_discovery(runner, redis_client)
        d.addErrback(lambda f: logger.error(f"Book discovery error: {f.getErrorMessage()}"))
        d.addCallback(lambda _: logger.info(f"Sleeping {CHECK_INTERVAL // 3600}h until next check..."))
        return d

    # Run immediately, then repeat every CHECK_INTERVAL seconds
    loop = task.LoopingCall(run_cycle)
    loop.start(CHECK_INTERVAL, now=True)
    reactor.run(installSignalHandlers=True)
