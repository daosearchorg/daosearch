import asyncio
import hashlib
import json
import logging

from fastapi import APIRouter, Query, Header, HTTPException
from fastapi.responses import StreamingResponse

from schemas import NovelData, ChapterEntry, ChapterContent
from scraper.sites import get_scraper
from scraper.translate import translate_batch, clean_title
from scraper.proxy import _get_redis

logger = logging.getLogger(__name__)

router = APIRouter()

CHAPTER_CACHE_TTL = 12 * 60 * 60  # 12 hours


def _cache_key(url: str) -> str:
    h = hashlib.md5(url.encode()).hexdigest()
    return f"reader:chapters:{h}"


def _get_cached_chapters(url: str) -> list[ChapterEntry] | None:
    """Try to load chapter list from Redis cache."""
    try:
        r = _get_redis()
        data = r.get(_cache_key(url))
        if data:
            items = json.loads(data)
            return [ChapterEntry(**ch) for ch in items]
    except Exception:
        pass
    return None


def _cache_chapters(url: str, chapters: list[ChapterEntry]) -> None:
    """Save chapter list to Redis with TTL."""
    try:
        r = _get_redis()
        data = json.dumps([ch.model_dump() for ch in chapters])
        r.setex(_cache_key(url), CHAPTER_CACHE_TTL, data)
    except Exception as e:
        logger.debug(f"Failed to cache chapters: {e}")


async def _translate_chapter_titles(chapters: list[ChapterEntry]) -> None:
    """Translate chapter titles in-place. Batches of 100, max 10 concurrent."""
    if not chapters:
        return
    try:
        BATCH = 100
        MAX_CONCURRENT = 10
        semaphore = asyncio.Semaphore(MAX_CONCURRENT)
        titles = [ch.title for ch in chapters]
        translated: list[str] = [""] * len(titles)

        async def translate_chunk(start: int, chunk: list[str]) -> tuple[int, list[str]]:
            async with semaphore:
                result = await translate_batch(chunk)
                return start, result

        tasks = []
        for i in range(0, len(titles), BATCH):
            chunk = titles[i:i + BATCH]
            tasks.append(translate_chunk(i, chunk))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, tuple):
                start, parts = result
                for j, t in enumerate(parts):
                    translated[start + j] = t

        for i, ch in enumerate(chapters):
            if i < len(translated) and translated[i] and translated[i] != ch.title:
                ch.title_en = clean_title(translated[i])
    except Exception as e:
        logger.debug(f"Chapter title translation failed: {e}")


@router.get("/novel", response_model=NovelData)
async def get_novel(url: str = Query(..., description="Novel page URL")):
    """Scrape novel metadata from a supported site."""
    try:
        scraper = get_scraper(url)
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported site")
    return await scraper.scrape_novel_data(url)


@router.get("/chapters")
async def get_chapters(
    url: str = Query(..., description="Novel page URL"),
    refresh: bool = Query(False, description="Skip cache and re-fetch"),
    stream: bool = Query(False, description="Stream progress via SSE"),
):
    """Get chapter list. Returns from Redis cache if fresh, otherwise scrapes + translates + caches.

    With stream=true, returns SSE events with progress updates, final event has the chapter list.
    """
    try:
        scraper = get_scraper(url)
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported site")

    # Check Redis cache first (unless refresh requested)
    if not refresh:
        cached = _get_cached_chapters(url)
        if cached:
            logger.info(f"Serving {len(cached)} chapters from cache for {url}")
            if stream:
                async def cached_stream():
                    yield _sse("status", "Loaded from cache")
                    yield _sse("chapters", json.dumps([ch.model_dump() for ch in cached]))
                return StreamingResponse(cached_stream(), media_type="text/event-stream")
            return cached

    if stream:
        return StreamingResponse(
            _stream_chapters(scraper, url),
            media_type="text/event-stream",
        )

    # Non-streaming fallback
    chapters = await scraper.get_chapter_urls(url)
    await _translate_chapter_titles(chapters)
    _cache_chapters(url, chapters)
    return chapters


def _sse(event: str, data: str) -> str:
    """Format a Server-Sent Event. Handles multi-line data correctly.
    Adds padding comment to ensure minimum size for HTTP flush."""
    data_lines = "\n".join(f"data: {line}" for line in data.split("\n"))
    # Padding ensures the chunk is large enough to not be buffered
    return f"event: {event}\n{data_lines}\n\n"


async def _stream_chapters(scraper, url: str):
    """SSE generator: streams progress events while scraping + translating chapters."""
    from urllib.parse import urlparse
    domain = urlparse(url).hostname or "source"

    yield _sse("status", f"Fetching chapter list from {domain}...")

    try:
        chapters = await scraper.get_chapter_urls(url)
    except Exception as e:
        yield _sse("error", f"Failed to fetch chapters: {e}")
        return

    if not chapters:
        yield _sse("error", "No chapters found at this source.")
        return

    yield _sse("status", f"Found {len(chapters)} chapters. Translating titles...")

    await _translate_chapter_titles(chapters)

    yield _sse("status", "Caching results...")

    _cache_chapters(url, chapters)

    yield _sse("status", "Done")
    yield _sse("chapters", json.dumps([ch.model_dump() for ch in chapters]))


@router.get("/chapter")
async def get_chapter(
    url: str = Query(..., description="Chapter page URL"),
    translate: str = Query("raw", description="Translation tier: raw | ai | byok"),
    book_id: int | None = Query(None, description="DaoSearch book ID (for entity lookup)"),
    stream: bool = Query(False, description="Stream translation via SSE"),
    x_user_id: int | None = Header(None, alias="x-user-id"),
    x_byok_key: str | None = Header(None, alias="x-byok-key"),
    x_byok_endpoint: str | None = Header(None, alias="x-byok-endpoint"),
    x_byok_model: str | None = Header(None, alias="x-byok-model"),
    x_custom_instructions: str | None = Header(None, alias="x-custom-instructions"),
):
    """Scrape a single chapter's content, optionally translate via AI/BYOK with SSE streaming."""
    try:
        scraper = get_scraper(url)
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported site")

    chapter = await scraper.scrape_chapter(url)

    # Raw — return as-is
    if translate == "raw" or not stream:
        if translate == "raw":
            return chapter
        # Non-streaming AI/BYOK — not supported, return raw
        return chapter

    # AI or BYOK streaming translation
    if translate in ("ai", "byok"):
        return StreamingResponse(
            _stream_translated_chapter(
                chapter=chapter,
                translate=translate,
                book_id=book_id,
                user_id=x_user_id,
                byok_key=x_byok_key,
                byok_endpoint=x_byok_endpoint,
                byok_model=x_byok_model,
                custom_instructions=x_custom_instructions,
            ),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return chapter


async def _stream_translated_chapter(
    chapter,
    translate: str,
    book_id: int | None,
    user_id: int | None,
    byok_key: str | None,
    byok_endpoint: str | None,
    byok_model: str | None,
    custom_instructions: str | None,
):
    """SSE generator for AI/BYOK chapter translation."""
    from translation.pipeline import translate_chapter_stream, TranslationEvent
    from db import async_session as get_session

    # Build LLM client
    from config import settings

    llm = None
    model = settings.translation_model

    if translate == "ai":
        if not settings.gemini_api_key:
            yield _sse("error", "AI translation not configured on this server.")
            return
        from translation.llm_client import GeminiClient
        llm = GeminiClient(api_key=settings.gemini_api_key)
    elif translate == "byok":
        if not byok_key or not byok_endpoint:
            yield _sse("error", "BYOK API key and endpoint required.")
            return
        from translation.llm_client import OpenAIClient
        model = byok_model or "gpt-4o"
        llm = OpenAIClient(api_key=byok_key, base_url=byok_endpoint, model=model)

    if not llm:
        yield _sse("error", "Invalid translation tier.")
        return

    # Yield chapter metadata first
    yield _sse("chapter_meta", json.dumps({
        "title": chapter.title,
        "chapter_url": chapter.chapter_url,
        "vip": chapter.vip,
    }))

    # Stream translation — yield each event immediately
    async with get_session() as session:
        async for event in translate_chapter_stream(
            llm=llm,
            raw_content=chapter.content,
            session=session if book_id else None,
            book_id=book_id,
            user_id=user_id,
            model=model,
            custom_instructions=custom_instructions,
        ):
            yield _sse(event.event, event.data)
            await asyncio.sleep(0)  # force flush
