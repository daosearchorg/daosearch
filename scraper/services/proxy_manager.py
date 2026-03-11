"""Redis-based Proxy Manager for concurrent workers."""

import logging
from typing import Dict

import redis

from core.config import config


PROXY_SET_KEY = "scraper:proxies:pool"
DISCOVERY_POOL_KEY = "scraper:proxies:discovery"

logger = logging.getLogger(__name__)


class RedisProxyManager:
    """Proxy manager backed by Redis set storage."""

    def __init__(self, redis_client=None, pool_key=None):
        self.redis = redis_client or redis.from_url(config.redis['url'])
        self.pool_key = pool_key or PROXY_SET_KEY

    def _decode_proxy(self, proxy_value) -> str:
        if proxy_value is None:
            return ""
        if isinstance(proxy_value, bytes):
            return proxy_value.decode("utf-8")
        return str(proxy_value)

    def get_next_proxy(self) -> str:
        """Get a random proxy from Redis set."""
        proxy = self._decode_proxy(self.redis.srandmember(self.pool_key))
        if not proxy:
            raise ValueError(
                f"No proxies found in Redis set '{self.pool_key}'. "
                "Add proxies via /proxies in the backend."
            )
        return proxy

    def get_random_proxy(self) -> str:
        """Get random proxy (same behavior as get_next_proxy)."""
        return self.get_next_proxy()

    def format_proxy_for_requests(self, proxy_string: str) -> Dict[str, str]:
        """Format proxy string for requests library"""
        try:
            server, port, username, password = proxy_string.split(':')
            proxy_url = f"http://{username}:{password}@{server}:{port}"
            return {
                'http': proxy_url,
                'https': proxy_url
            }
        except ValueError as e:
            raise ValueError(f"Invalid proxy format: {proxy_string}") from e

    def get_stats(self) -> dict:
        """Get proxy pool statistics."""
        return {
            'proxy_set_key': self.pool_key,
            'total_proxies': self.redis.scard(self.pool_key),
        }

