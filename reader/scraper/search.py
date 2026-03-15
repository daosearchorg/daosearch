"""Novel search via SearXNG, scoped to supported scraper domains."""

from __future__ import annotations

import hashlib
import json
import logging
import re
from urllib.parse import urlparse

import httpx

from config import settings
from schemas import SearchResult
from scraper.sites import get_scrapers, get_site_priority
from scraper.translate import translate_batch, title_case
from scraper.proxy import _get_redis

SEARCH_CACHE_TTL = 3600  # 1 hour

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

    # Sort by relevance: title match > snippet match > no match, then site priority
    def _relevance(r: SearchResult) -> tuple[int, int]:
        text = r.title + " " + (r.snippet or "")
        # Check if the full query appears in the result
        if query in text:
            return (0, get_site_priority(r.domain))
        # Check if the majority of query characters appear (handles slight differences)
        query_chars = set(query)
        text_chars = set(text)
        overlap = len(query_chars & text_chars) / max(len(query_chars), 1)
        if overlap > 0.7:
            return (1, get_site_priority(r.domain))
        # Check individual words — split Chinese title by common separators
        query_parts = [p for p in re.split(r'[：:·\s]', query) if len(p) >= 2]
        matches = sum(1 for p in query_parts if p in text)
        if query_parts and matches >= len(query_parts) * 0.5:
            return (1, get_site_priority(r.domain))
        return (2, get_site_priority(r.domain))

    results.sort(key=_relevance)
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
    """Search + translate in one call (non-streaming). Cached for 1 hour."""
    # Check cache
    cached = _get_cached_search(query)
    if cached:
        return cached

    results = await search_novels_raw(query, max_results)
    await translate_results(results)

    # Cache results
    _cache_search(query, results)
    return results


def _search_cache_key(query: str) -> str:
    h = hashlib.md5(query.encode()).hexdigest()
    return f"reader:search:{h}"


def _get_cached_search(query: str) -> list[SearchResult] | None:
    try:
        r = _get_redis()
        data = r.get(_search_cache_key(query))
        if data:
            items = json.loads(data)
            return [SearchResult(**item) for item in items]
    except Exception:
        pass
    return None


def _cache_search(query: str, results: list[SearchResult]) -> None:
    try:
        r = _get_redis()
        data = json.dumps([res.model_dump() for res in results])
        r.setex(_search_cache_key(query), SEARCH_CACHE_TTL, data)
    except Exception:
        pass
