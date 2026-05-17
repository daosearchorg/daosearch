"""Process-wide shared Redis connection.

Creating redis.from_url() (or RedisProxyManager()/QueueManager()) per job
opens a fresh, unbounded connection pool every time. Under heavy queue
throughput that exhausts ephemeral source ports
(OSError: [Errno 99] Cannot assign requested address). Reuse one bounded,
keep-alive pool per worker process instead.
"""
import redis

from core.config import config

_CLIENT = None


def get_redis():
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = redis.from_url(
            config.redis['url'],
            max_connections=50,          # bound the pool per process
            socket_keepalive=True,
            socket_timeout=30,
            socket_connect_timeout=10,
            health_check_interval=30,
            retry_on_timeout=True,
        )
    return _CLIENT
