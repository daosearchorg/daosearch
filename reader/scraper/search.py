"""Novel search via SearXNG, scoped to supported scraper domains."""

from __future__ import annotations

import logging
from urllib.parse import urlparse

import httpx

from config import settings
from schemas import SearchResult
from scraper.sites import get_scrapers, get_site_priority
from scraper.translate import translate_batch, title_case

logger = logging.getLogger(__name__)


def _build_site_filter() -> str:
    """Build a site: OR filter from all registered scraper domains."""
    return " OR ".join(f"site:{domain}" for domain in get_scrapers())


async def search_novels_raw(query: str, max_results: int = 20) -> list[SearchResult]:
    """Search SearXNG and filter to supported novel URLs. No translation."""
    scrapers = get_scrapers()
    site_filter = _build_site_filter()
    full_query = f"{query} ({site_filter})"

    logger.info(f"Searching: {full_query}")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{settings.searxng_url}/search",
            params={
                "q": full_query,
                "format": "json",
                "categories": "general",
            },
        )
        resp.raise_for_status()

    data = resp.json()
    results: list[SearchResult] = []
    seen_urls: set[str] = set()

    for item in data.get("results", []):
        url = item.get("url", "")
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)

        domain = urlparse(url).hostname or ""
        scraper_cls = None
        for pattern, cls in scrapers.items():
            if pattern in domain:
                scraper_cls = cls
                break
        if not scraper_cls:
            continue

        scraper = scraper_cls()
        if not scraper.is_novel_url(url):
            continue

        results.append(SearchResult(
            title=item.get("title", ""),
            url=url,
            snippet=item.get("content", ""),
            domain=domain,
        ))

        if len(results) >= max_results:
            break

    results.sort(key=lambda r: get_site_priority(r.domain))
    logger.info(f"Found {len(results)} novel URLs from {len(seen_urls)} raw results")
    return results


async def translate_results(results: list[SearchResult]) -> None:
    """Translate titles and snippets in-place."""
    if not results:
        return
    texts_to_translate = [r.title for r in results] + [r.snippet for r in results]
    translated = await translate_batch(texts_to_translate)
    n = len(results)
    for i, r in enumerate(results):
        r.title_en = title_case(translated[i])
        r.snippet_en = translated[n + i]


async def search_novels(query: str, max_results: int = 20) -> list[SearchResult]:
    """Search + translate in one call (non-streaming)."""
    results = await search_novels_raw(query, max_results)
    await translate_results(results)
    return results
