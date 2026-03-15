"""Lightweight proxy manager — reads from the same Redis proxy pool as the scraper."""

import logging
import redis as redis_lib

from config import settings

logger = logging.getLogger(__name__)

PROXY_SET_KEY = "scraper:proxies:pool"

_redis: redis_lib.Redis | None = None


def _get_redis() -> redis_lib.Redis:
    global _redis
    if _redis is None:
        _redis = redis_lib.from_url(settings.redis_url)
    return _redis


def get_random_proxy() -> str | None:
    """Get a random proxy string from Redis. Returns None if pool is empty."""
    try:
        r = _get_redis()
        proxy = r.srandmember(PROXY_SET_KEY)
        if proxy is None:
            return None
        raw = proxy.decode("utf-8") if isinstance(proxy, bytes) else str(proxy)
        return raw.strip()
    except Exception as e:
        logger.debug(f"Failed to get proxy from Redis: {e}")
        return None


def format_for_httpx(proxy_string: str) -> str:
    """Convert 'host:port:user:pass' to httpx proxy URL."""
    server, port, username, password = proxy_string.split(":")
    return f"http://{username}:{password}@{server}:{port}"
