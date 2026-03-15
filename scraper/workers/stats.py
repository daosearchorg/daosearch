"""
Stats Worker - Refreshes denormalized book_stats table and handles image uploads
"""

import logging
from io import BytesIO

import boto3
import redis as redis_lib
import requests
from sqlalchemy import text

from core.config import config
from core.database import db_manager
from services.queue_manager import QueueManager

redis_client = redis_lib.from_url(config.redis['url'])

logger = logging.getLogger(__name__)


def refresh_book_stats(limit: int = 5000) -> dict:
    """
    Bulk upsert book_stats from source tables.
    Uses LATERAL subqueries for efficient aggregation.
    Picks books with the oldest (or missing) book_stats.updated_at first,
    so it naturally rotates through all books.
    """
    query = text("""
        INSERT INTO book_stats (
            book_id, chapter_count, latest_chapter_number,
            rating_count, rating_positive, rating_negative, rating_neutral,
            comment_count,
            review_count, reader_count, bookmark_count, updated_at
        )
        SELECT
            b.id,
            COALESCE(ch.chapter_count, 0),
            COALESCE(ch.latest_chapter_number, 0),
            COALESCE(rt.rating_count, 0),
            COALESCE(rt.rating_positive, 0),
            COALESCE(rt.rating_negative, 0),
            COALESCE(rt.rating_neutral, 0),
            COALESCE(cm.comment_count, 0),
            COALESCE(rv.review_count, 0),
            COALESCE(rp.reader_count, 0),
            COALESCE(bk.bookmark_count, 0),
            NOW()
        FROM books b
        LEFT JOIN book_stats bs ON bs.book_id = b.id
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) AS chapter_count,
                COALESCE(MAX(sequence_number), 0) AS latest_chapter_number
            FROM chapters WHERE book_id = b.id
        ) ch ON true
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) AS rating_count,
                COUNT(*) FILTER (WHERE rating = 1) AS rating_positive,
                COUNT(*) FILTER (WHERE rating = -1) AS rating_negative,
                COUNT(*) FILTER (WHERE rating = 0) AS rating_neutral
            FROM book_ratings WHERE book_id = b.id
        ) rt ON true
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS comment_count
            FROM book_comments WHERE book_id = b.id
        ) cm ON true
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS review_count
            FROM book_reviews WHERE book_id = b.id
        ) rv ON true
        LEFT JOIN LATERAL (
            SELECT COUNT(DISTINCT user_id) AS reader_count
            FROM reading_progresses WHERE book_id = b.id
        ) rp ON true
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS bookmark_count
            FROM bookmarks WHERE book_id = b.id
        ) bk ON true
        ORDER BY bs.updated_at ASC NULLS FIRST
        LIMIT :limit
        ON CONFLICT (book_id) DO UPDATE SET
            chapter_count = EXCLUDED.chapter_count,
            latest_chapter_number = EXCLUDED.latest_chapter_number,
            rating_count = EXCLUDED.rating_count,
            rating_positive = EXCLUDED.rating_positive,
            rating_negative = EXCLUDED.rating_negative,
            rating_neutral = EXCLUDED.rating_neutral,
            comment_count = EXCLUDED.comment_count,
            review_count = EXCLUDED.review_count,
            reader_count = EXCLUDED.reader_count,
            bookmark_count = EXCLUDED.bookmark_count,
            updated_at = EXCLUDED.updated_at
    """)

    try:
        with db_manager.get_session() as session:
            result = session.execute(query, {'limit': limit})
            rows_affected = result.rowcount
            session.commit()

        logger.info(f"Refreshed book_stats for {rows_affected} books")
        return {'books_updated': rows_affected}

    except Exception as e:
        logger.error(f"Failed to refresh book_stats: {e}")
        raise


def upload_images(limit: int = 1000) -> dict:
    """
    Dispatcher: finds images needing migration and enqueues individual upload jobs.
    """
    r2_config = config.r2
    public_url = r2_config['public_url']
    queue_manager = QueueManager()

    # Prefetch already-queued job IDs to avoid duplicates
    queued_ids = queue_manager.get_all_job_ids('general')

    with db_manager.get_session() as session:
        books = session.execute(
            text("""
                SELECT id, image_url FROM books
                WHERE image_url LIKE 'http%'
                AND image_url NOT LIKE :prefix
                LIMIT :limit
            """),
            {'prefix': f'{public_url}%', 'limit': limit}
        ).fetchall()

        qq_users = session.execute(
            text("""
                SELECT id, icon_url FROM qq_users
                WHERE icon_url LIKE 'http%'
                AND icon_url NOT LIKE :prefix
                LIMIT :limit
            """),
            {'prefix': f'{public_url}%', 'limit': limit}
        ).fetchall()

    books_queued = 0
    for row in books:
        job_id = f"upload_book_image_{row.id}"
        if job_id not in queued_ids:
            queue_manager.add_general_job('upload_book_image', job_id=job_id, book_id=row.id, source_url=row.image_url)
            books_queued += 1

    avatars_queued = 0
    avatars_skipped = 0
    for row in qq_users:
        job_id = f"upload_avatar_image_{row.id}"
        if job_id not in queued_ids:
            if _is_avatar_blocked(row.icon_url):
                avatars_skipped += 1
                continue
            queue_manager.add_general_job('upload_avatar_image', job_id=job_id, user_id=row.id, source_url=row.icon_url)
            avatars_queued += 1

    logger.info(f"Queued {books_queued} book image + {avatars_queued} avatar upload jobs")
    return {'books_queued': books_queued, 'avatars_queued': avatars_queued}


def _get_s3_client():
    """Create boto3 S3 client for R2."""
    r2_config = config.r2
    return boto3.client(
        's3',
        endpoint_url=r2_config['endpoint_url'],
        aws_access_key_id=r2_config['access_key_id'],
        aws_secret_access_key=r2_config['secret_access_key'],
    )


def upload_book_image(book_id: int, source_url: str) -> dict:
    """Download a single book cover and upload to R2."""
    r2_config = config.r2
    r2_key = f'books/{book_id}.jpg'

    try:
        resp = requests.get(source_url, timeout=15)
        resp.raise_for_status()
        s3 = _get_s3_client()
        s3.put_object(
            Bucket=r2_config['bucket_name'],
            Key=r2_key,
            Body=BytesIO(resp.content),
            ContentType=resp.headers.get('Content-Type', 'image/jpeg'),
        )
        new_url = f"{r2_config['public_url']}/{r2_key}"
        with db_manager.get_session() as session:
            session.execute(
                text("UPDATE books SET image_url = :url WHERE id = :id"),
                {'url': new_url, 'id': book_id}
            )
            session.commit()
        logger.info(f"Uploaded book image {book_id}")
        return {'book_id': book_id, 'status': 'ok'}
    except Exception as e:
        logger.warning(f"Failed to upload book image {book_id}: {e}")
        return {'book_id': book_id, 'status': 'error', 'error': str(e)}


AVATAR_BLOCKED_KEY = 'avatars:blocked_domains'


def _is_avatar_blocked(source_url: str) -> bool:
    """Check if avatar URL domain is in the blocklist."""
    try:
        from urllib.parse import urlparse
        domain = urlparse(source_url).hostname or ""
        blocked = redis_client.smembers(AVATAR_BLOCKED_KEY)
        blocked = {d.decode() if isinstance(d, bytes) else d for d in blocked}
        return domain in blocked
    except Exception:
        return False


def _block_avatar_domain(source_url: str) -> None:
    """Add avatar URL domain to the blocklist after repeated failures."""
    try:
        from urllib.parse import urlparse
        domain = urlparse(source_url).hostname or ""
        if domain:
            redis_client.sadd(AVATAR_BLOCKED_KEY, domain)
            logger.info(f"Blocked avatar domain: {domain}")
    except Exception:
        pass


def upload_avatar_image(user_id: int, source_url: str) -> dict:
    """Download a single QQ user avatar and upload to R2.

    On failure: clears icon_url from DB (frontend handles fallback)
    and tracks the domain in a Redis blocklist to skip future attempts.
    """
    # Skip known-dead domains
    if _is_avatar_blocked(source_url):
        return {'user_id': user_id, 'status': 'skipped', 'reason': 'blocked_domain'}

    r2_config = config.r2
    r2_key = f'avatars/{user_id}.jpg'

    try:
        resp = requests.get(source_url, timeout=10)
        resp.raise_for_status()

        # Skip tiny responses (likely error pages, not real images)
        if len(resp.content) < 100:
            raise ValueError(f"Response too small ({len(resp.content)} bytes)")

        content_type = resp.headers.get('Content-Type', '')
        if not content_type.startswith('image/'):
            raise ValueError(f"Not an image: {content_type}")

        s3 = _get_s3_client()
        s3.put_object(
            Bucket=r2_config['bucket_name'],
            Key=r2_key,
            Body=BytesIO(resp.content),
            ContentType=content_type,
        )
        new_url = f"{r2_config['public_url']}/{r2_key}"
        with db_manager.get_session() as session:
            session.execute(
                text("UPDATE qq_users SET icon_url = :url WHERE id = :id"),
                {'url': new_url, 'id': user_id}
            )
            session.commit()
        logger.info(f"Uploaded avatar {user_id}")
        return {'user_id': user_id, 'status': 'ok'}
    except Exception as e:
        logger.warning(f"Failed to upload avatar {user_id}: {e}")
        # Clear the broken URL so we don't retry and frontend uses fallback
        with db_manager.get_session() as session:
            session.execute(
                text("UPDATE qq_users SET icon_url = NULL WHERE id = :id"),
                {'id': user_id}
            )
            session.commit()
        # Track failures per domain — block after enough failures
        _track_avatar_failure(source_url)
        return {'user_id': user_id, 'status': 'cleared'}


def _track_avatar_failure(source_url: str) -> None:
    """Track avatar download failures per domain. Auto-block after 10 failures."""
    try:
        from urllib.parse import urlparse
        domain = urlparse(source_url).hostname or ""
        if not domain:
            return
        key = f"avatars:failures:{domain}"
        count = redis_client.incr(key)
        redis_client.expire(key, 86400)  # 24h TTL
        if count >= 10:
            _block_avatar_domain(source_url)
    except Exception:
        pass
