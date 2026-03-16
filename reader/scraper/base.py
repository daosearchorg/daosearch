"""Base scraper with Google Translate proxy for Cloudflare bypass + residential proxy rotation."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from urllib.parse import urlparse, urljoin, parse_qs

import httpx
from lxml import html as lxml_html

from schemas import NovelData, ChapterEntry, ChapterContent
from scraper.proxy import get_random_proxy, format_for_httpx

logger = logging.getLogger(__name__)

GT_PARAMS = {"_x_tr_sl": "zh-CN", "_x_tr_tl": "en", "_x_tr_hl": "en-US", "_x_tr_pto": "wapp"}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def to_gt_url(url: str) -> str:
    """Convert a URL to its Google Translate proxy equivalent.

    https://www.69shuba.com/book/88724.htm
    → https://69shuba-com.translate.goog/book/88724.htm?_x_tr_sl=zh&_x_tr_tl=en&_x_tr_hl=en-GB
    """
    parsed = urlparse(url)
    hostname = parsed.hostname
    gt_host = hostname.replace(".", "-") + ".translate.goog"
    params = "&".join(f"{k}={v}" for k, v in GT_PARAMS.items())
    query = f"{parsed.query}&{params}" if parsed.query else params
    return f"https://{gt_host}{parsed.path}?{query}"


def _get_proxy_url() -> str | None:
    """Get a formatted proxy URL from Redis, or None if unavailable."""
    proxy_str = get_random_proxy()
    if proxy_str:
        try:
            return format_for_httpx(proxy_str)
        except ValueError:
            return None
    return None


class BaseScraper(ABC):
    """Base class for site-specific scrapers.

    Fetches pages through Google Translate proxy to bypass Cloudflare.
    Uses residential proxies from Redis pool when available.
    Falls back to direct httpx if GT proxy fails.
    """

    async def _fetch(self, url: str, encoding: str | None = None, use_gt: bool = True) -> str:
        """Fetch a page. Tries GT proxy first, then direct with residential proxy."""
        proxy_url = _get_proxy_url()

        # Tier 1: Google Translate proxy
        if use_gt:
            for attempt_proxy in ([proxy_url, None] if proxy_url else [None]):
                try:
                    gt_url = to_gt_url(url)
                    async with httpx.AsyncClient(
                        timeout=20, follow_redirects=True, headers=HEADERS, proxy=attempt_proxy,
                    ) as client:
                        resp = await client.get(gt_url)
                        # GT sometimes returns 403 with valid content — don't raise
                        # GT passes through raw bytes, so decode with encoding if specified
                        html = resp.content.decode(encoding, errors="replace") if encoding else resp.text
                        if len(html) > 500:
                            return html
                except Exception as e:
                    label = "proxied GT" if attempt_proxy else "direct GT"
                    logger.debug(f"{label} failed for {url}: {e}")

        # Tier 2: Direct fetch with residential proxy
        if proxy_url:
            try:
                async with httpx.AsyncClient(
                    timeout=20, follow_redirects=True, headers=HEADERS, proxy=proxy_url,
                ) as client:
                    resp = await client.get(url)
                    resp.raise_for_status()
                    return resp.content.decode(encoding, errors="replace") if encoding else resp.text
            except Exception as e:
                logger.debug(f"Proxied direct fetch failed for {url}: {e}")

        # Tier 3: Direct fetch without proxy (last resort)
        try:
            async with httpx.AsyncClient(
                timeout=20, follow_redirects=True, headers=HEADERS,
            ) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                return resp.content.decode(encoding, errors="replace") if encoding else resp.text
        except Exception as e:
            logger.warning(f"All fetch methods failed for {url}: {e}")
            raise RuntimeError(f"All fetch methods failed for {url}")

    def _parse(self, html: str) -> lxml_html.HtmlElement:
        """Parse HTML string into lxml tree."""
        return lxml_html.fromstring(html)

    def _text(self, tree: lxml_html.HtmlElement, selector: str) -> str:
        """Get text content of first element matching CSS selector."""
        els = tree.cssselect(selector)
        return els[0].text_content().strip() if els else ""

    def _meta(self, tree: lxml_html.HtmlElement, prop: str) -> str:
        """Get content attribute from meta tag with given property."""
        els = tree.cssselect(f'meta[property="{prop}"]')
        if els:
            content = els[0].get("content", "")
            return content.strip() if content else ""
        return ""

    def _unwrap_gt_href(self, href: str, base_url: str) -> str | None:
        """Extract original URL from a GT proxy-rewritten href.

        GT rewrites hrefs in 3 ways:
        - https://translate.google.com/website?sl=zh&tl=en&...&u=https://original.com/path
        - https://original-com.translate.goog/path?_x_tr_sl=zh&...
        - /path (relative, untouched)
        """
        if "translate.google.com/website" in href:
            parsed = urlparse(href)
            params = parse_qs(parsed.query)
            urls = params.get("u", [])
            return urls[0] if urls else None
        elif ".translate.goog" in href:
            parsed = urlparse(href)
            host = parsed.hostname or ""
            original_host = host.replace(".translate.goog", "").replace("-", ".")
            return f"https://www.{original_host}{parsed.path}"
        elif href.startswith("/"):
            return urljoin(base_url, href)
        elif href.startswith("http"):
            return href
        return None

    @abstractmethod
    async def scrape_novel_data(self, url: str) -> NovelData: ...

    @abstractmethod
    async def get_chapter_urls(self, novel_url: str) -> list[ChapterEntry]: ...

    @abstractmethod
    async def scrape_chapter(self, url: str) -> ChapterContent: ...

    @abstractmethod
    def is_novel_url(self, url: str) -> bool: ...
