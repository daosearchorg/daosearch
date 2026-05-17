"""RQ worker: resolve and store books.qidian_id for a single book."""
import logging

import redis

from core.config import config
from core.database import db_manager
from core.models import Book
from services.book_matcher import (
    resolve_qidian_id, CookieUnavailable, ChallengeBlocked)
from services.proxy_manager import RedisProxyManager

logger = logging.getLogger(__name__)


def decide_assignment(resolved_qid, owner_book_id, this_book_id):
    """Pure decision helper (unit-tested).

    owner_book_id = id of the book that currently has resolved_qid, or None.
    Returns (action, qid) where action in {none, assign, noop, conflict}.
    """
    if resolved_qid is None:
        return ("none", None)
    if owner_book_id is None:
        return ("assign", resolved_qid)
    if owner_book_id == this_book_id:
        return ("noop", resolved_qid)
    return ("conflict", resolved_qid)


def map_book_qidian_id(book_id: int) -> dict:
    """Resolve a qidian book id for `book_id` and store it.

    Raises (so RQ retries later) when the cookie is stale/challenged — by then
    the minter will have refreshed it.
    """
    rconn = redis.from_url(config.redis["url"])
    pm = RedisProxyManager()

    with db_manager.get_session() as session:
        book = session.query(Book).filter(Book.id == book_id).first()
        if not book:
            return {"book_id": book_id, "result": "book_not_found"}
        if book.qidian_id is not None:
            return {"book_id": book_id, "result": "already_mapped",
                    "qidian_id": book.qidian_id}
        if not book.title:
            return {"book_id": book_id, "result": "no_title"}
        title, author = book.title, book.author

    # Network call outside the DB session.
    qid = resolve_qidian_id(rconn, pm, title, author)

    with db_manager.get_session() as session:
        book = session.query(Book).filter(Book.id == book_id).first()
        if not book or book.qidian_id is not None:
            return {"book_id": book_id, "result": "raced_or_gone"}
        owner = None
        if qid is not None:
            owner_row = session.query(Book.id).filter(
                Book.qidian_id == qid).first()
            owner = owner_row.id if owner_row else None
        action, q = decide_assignment(qid, owner, book_id)
        if action == "assign":
            book.qidian_id = q
            book.qidiantu_url = f"https://www.qidiantu.com/info/{q}"
            session.commit()
            logger.info("Mapped book %s -> qidian_id %s", book_id, q)
            return {"book_id": book_id, "result": "mapped", "qidian_id": q}
        if action == "conflict":
            logger.warning(
                "qidian_id %s for book %s already owned by book %s; skipping",
                q, book_id, owner)
            return {"book_id": book_id, "result": "conflict",
                    "qidian_id": q, "owner": owner}
        if action == "noop":
            return {"book_id": book_id, "result": "noop", "qidian_id": q}
        return {"book_id": book_id, "result": "no_match"}
