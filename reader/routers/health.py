from fastapi import APIRouter
from scraper.sites import get_scrapers

router = APIRouter()


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "supported_sites": list(get_scrapers().keys()),
    }
