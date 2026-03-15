from fastapi import APIRouter, Query

from schemas import SearchResult
from scraper.search import search_novels

router = APIRouter()


@router.get("/search", response_model=list[SearchResult])
async def search(q: str = Query(..., min_length=1, description="Search query (novel title)")):
    """Search for novels across supported raw sites via SearXNG."""
    return await search_novels(q)
