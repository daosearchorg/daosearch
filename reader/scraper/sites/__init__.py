from __future__ import annotations

from urllib.parse import urlparse

from scraper.base import BaseScraper

_SCRAPERS: dict[str, type[BaseScraper]] | None = None


def _load_scrapers() -> dict[str, type[BaseScraper]]:
    from scraper.sites.shuba69 import Shuba69Scraper
    from scraper.sites.shuba69tw import Shuba69TwScraper
    from scraper.sites.bookqq import BookQQScraper
    from scraper.sites.novel543 import Novel543Scraper
    from scraper.sites.twkan import TwkanScraper
    from scraper.sites.uukanshu import UukanshuScraper
    from scraper.sites.bixiange import BixiangeScraper
    from scraper.sites.ffxs8 import Ffxs8Scraper
    from scraper.sites.ixdzs import IxdzsScraper
    from scraper.sites.mokakanshu import MokakanshuScraper
    from scraper.sites.shuhaige import ShuhaigeScraper
    from scraper.sites.trxs import TrxsScraper
    return {
        "book.qq.com": BookQQScraper,
        "69shuba.com": Shuba69Scraper,
        "69shuba.tw": Shuba69TwScraper,
        "novel543.com": Novel543Scraper,
        "twkan.com": TwkanScraper,
        "uukanshu.cc": UukanshuScraper,
        "bixiange.me": BixiangeScraper,
        "ffxs8.com": Ffxs8Scraper,
        "ixdzs8.com": IxdzsScraper,
        "mokakanshu.vip": MokakanshuScraper,
        "shuhaige.net": ShuhaigeScraper,
        "trxs.cc": TrxsScraper,
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
    "novel543.com": 3,
    "twkan.com": 4,
    "uukanshu.cc": 5,
    "bixiange.me": 6,
    "ffxs8.com": 7,
    "ixdzs8.com": 8,
    "mokakanshu.vip": 9,
    "shuhaige.net": 10,
    "trxs.cc": 11,
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
