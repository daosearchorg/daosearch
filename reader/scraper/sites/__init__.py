from __future__ import annotations

from urllib.parse import urlparse

from scraper.base import BaseScraper

_SCRAPERS: dict[str, type[BaseScraper]] | None = None


def _load_scrapers() -> dict[str, type[BaseScraper]]:
    from scraper.sites.shuba69 import Shuba69Scraper
    from scraper.sites.bookqq import BookQQScraper

    return {
        "book.qq.com": BookQQScraper,
        "69shuba.com": Shuba69Scraper,
        "69shuba.tw": Shuba69Scraper,
    }


def get_scrapers() -> dict[str, type[BaseScraper]]:
    global _SCRAPERS
    if _SCRAPERS is None:
        _SCRAPERS = _load_scrapers()
    return _SCRAPERS


SITE_PRIORITY: dict[str, int] = {
    "book.qq.com": 0,
    "69shuba.com": 1,
    "69shuba.tw": 2,
}

DEFAULT_PRIORITY = 50


def get_site_priority(domain: str) -> int:
    for pattern, priority in SITE_PRIORITY.items():
        if pattern in domain:
            return priority
    return DEFAULT_PRIORITY


def get_scraper(url: str) -> BaseScraper:
    domain = urlparse(url).hostname or ""
    for pattern, scraper_cls in get_scrapers().items():
        if pattern in domain:
            return scraper_cls()
    raise ValueError(f"No scraper registered for {domain}")
