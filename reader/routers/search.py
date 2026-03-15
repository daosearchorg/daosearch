import json

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from schemas import SearchResult
from scraper.search import search_novels, search_novels_raw, translate_results, _get_cached_search, _cache_search

router = APIRouter()


def _sse(event: str, data: str) -> str:
    data_lines = "\n".join(f"data: {line}" for line in data.split("\n"))
    return f"event: {event}\n{data_lines}\n\n"


@router.get("/search")
async def search(
    q: str = Query(..., min_length=1, description="Search query (novel title)"),
    stream: bool = Query(False, description="Stream progress via SSE"),
):
    """Search for novels across supported raw sites via SearXNG."""
    if stream:
        return StreamingResponse(_stream_search(q), media_type="text/event-stream")
    results = await search_novels(q)
    return results


async def _stream_search(query: str):
    # Check cache first
    cached = _get_cached_search(query)
    if cached:
        yield _sse("status", "Loaded from cache")
        yield _sse("results", json.dumps([r.model_dump() for r in cached]))
        return

    yield _sse("status", "Searching the web...")

    try:
        results = await search_novels_raw(query)
    except Exception as e:
        yield _sse("error", f"Search failed: {e}")
        return

    if not results:
        yield _sse("status", "No sources found.")
        yield _sse("results", "[]")
        return

    yield _sse("status", "Found sources. Translating...")

    await translate_results(results)

    _cache_search(query, results)

    yield _sse("status", "Done")
    yield _sse("results", json.dumps([r.model_dump() for r in results]))
