from fastapi import APIRouter, Query, HTTPException

from schemas import NovelData, ChapterEntry, ChapterContent
from scraper.sites import get_scraper

router = APIRouter()


@router.get("/novel", response_model=NovelData)
async def get_novel(url: str = Query(..., description="Novel page URL")):
    """Scrape novel metadata from a supported site."""
    try:
        scraper = get_scraper(url)
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported site")
    return await scraper.scrape_novel_data(url)


@router.get("/chapters", response_model=list[ChapterEntry])
async def get_chapters(url: str = Query(..., description="Novel page URL")):
    """Get chapter list from a supported site."""
    try:
        scraper = get_scraper(url)
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported site")
    return await scraper.get_chapter_urls(url)


@router.get("/chapter", response_model=ChapterContent)
async def get_chapter(url: str = Query(..., description="Chapter page URL")):
    """Scrape a single chapter's content."""
    try:
        scraper = get_scraper(url)
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported site")
    return await scraper.scrape_chapter(url)
