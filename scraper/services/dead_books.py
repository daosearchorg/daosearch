"""Blacklist of dead book.qq.com books (404 on scrape/refresh).

Redis SET of bids that returned 404. Once dead, a book is deleted from the
DB and never re-scraped/refreshed; the discovery crawler skips re-inserting
it. Redis-set (not a table) to match the proxy-pool / cookie patterns and
avoid a migration; survives restarts via Redis persistence.
"""
import logging

DEAD_QQ_KEY = "scraper:qq:dead"

logger = logging.getLogger(__name__)


def mark_dead(rconn, bid) -> None:
    try:
        rconn.sadd(DEAD_QQ_KEY, str(bid))
    except Exception as e:
        logger.warning("mark_dead(%s) failed: %s", bid, e)


def is_dead(rconn, bid) -> bool:
    try:
        return rconn.sismember(DEAD_QQ_KEY, str(bid)) is True or \
            rconn.sismember(DEAD_QQ_KEY, str(bid)) == 1
    except Exception as e:
        logger.warning("is_dead(%s) failed: %s", bid, e)
        return False


def filter_alive_bids(rconn, bids: list[str]) -> list[str]:
    """Return only the bids NOT in the dead set (bulk; one round-trip)."""
    if not bids:
        return []
    try:
        pipe = rconn.pipeline()
        for b in bids:
            pipe.sismember(DEAD_QQ_KEY, str(b))
        flags = pipe.execute()
        return [b for b, dead in zip(bids, flags) if not dead]
    except Exception as e:
        logger.warning("filter_alive_bids failed (%s); passing all through", e)
        return bids
