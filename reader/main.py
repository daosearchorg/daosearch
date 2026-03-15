import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import search, scraper, health

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s: %(message)s",
)

app = FastAPI(
    title="DaoSearch Reader",
    description="Real-time chapter scraping and translation for DaoSearch",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(search.router)
app.include_router(scraper.router)
app.include_router(health.router)
