"""
Maintenance Worker - Orchestrator tasks for finding and queuing work

Optimization: Uses batch prefetch of Redis job IDs (get_all_job_ids) instead of
per-item is_job_in_queue calls. Queries select only needed columns (id, url) to
avoid loading full ORM objects.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, and_
from core.database import db_manager
from core.models import Book, Chapter, Genre, BookComment, QQUser, QidianBooklist, QidianBooklistItem
from services.queue_manager import QueueManager
from workers.charts_scraper import GENDER_RANK_TYPES, RANK_TYPE_CYCLES

logger = logging.getLogger(__name__)

class MaintenanceOrchestrator:
    """Finds books needing work and queues appropriate tasks"""

    def __init__(self):
        self.queue_manager = QueueManager()

    def find_missing_fields(self, limit: int = 50000) -> dict:
        """Find books with missing original scraped fields and queue scraping jobs"""
        scheduled_count = 0
        skipped_count = 0
        books_found = 0

        try:
            # Prefetch all scraper job IDs once (3 Redis calls total)
            queued_ids = self.queue_manager.get_all_job_ids('scraper')

            with db_manager.get_session() as session:
                rows = session.query(Book.id, Book.url).outerjoin(
                    Genre, Book.genre_id == Genre.id
                ).filter(
                    (Book.title.is_(None)) |
                    (Book.title == '') |
                    (Book.author.is_(None)) |
                    (Book.author == '') |
                    (Book.synopsis.is_(None)) |
                    (Book.synopsis == '') |
                    (Book.word_count.is_(None)) |
                    (Book.status.is_(None)) |
                    (Book.sex_attr.is_(None)) |
                    (Book.qq_score.is_(None)) |
                    (Book.qq_score_count.is_(None)) |
                    (Book.qq_favorite_count.is_(None)) |
                    (Book.qq_fan_count.is_(None))
                ).filter(
                    Book.url.is_not(None),
                    Book.url != '',
                    (Genre.blacklisted.is_(False)) | (Genre.id.is_(None)),
                ).limit(limit).all()

                books_found = len(rows)

                # Collect jobs to enqueue, skipping already-queued
                to_enqueue = []
                for book_id, url in rows:
                    if f"scrape_book_{book_id}" in queued_ids:
                        skipped_count += 1
                        continue
                    to_enqueue.append((url, book_id))

                # Bulk enqueue via Redis pipeline
                if to_enqueue:
                    scheduled_count = self.queue_manager.add_scrape_jobs_bulk(to_enqueue)
                    logger.info(f"Bulk enqueued {scheduled_count} scrape jobs for missing fields")

        except Exception as e:
            logger.error(f"Error finding books with missing fields: {e}")

        return {
            'books_found': books_found,
            'scheduled': scheduled_count,
            'skipped': skipped_count
        }

    def find_missing_translations(self, limit: int = 10000) -> dict:
        """Find untranslated content and queue translation jobs"""
        book_translations = 0
        chapter_translations = 0
        skipped_count = 0

        try:
            # Prefetch job IDs for both queues once
            book_queued_ids = self.queue_manager.get_all_job_ids('translation-books')
            chapter_queued_ids = self.queue_manager.get_all_job_ids('translation-chapters')

            with db_manager.get_session() as session:
                # Find books missing translations (only need id)
                rows = session.query(Book.id).outerjoin(
                    Genre, Book.genre_id == Genre.id
                ).filter(
                    (Book.title_translated.is_(None)) |
                    (Book.author_translated.is_(None)) |
                    (Book.synopsis_translated.is_(None))
                ).filter(
                    (Genre.blacklisted.is_(False)) | (Genre.id.is_(None)),
                ).limit(limit).all()

                # Collect book IDs to enqueue, skipping already-queued
                to_enqueue = []
                for (book_id,) in rows:
                    if f"translate_book_{book_id}" in book_queued_ids:
                        skipped_count += 1
                        continue
                    to_enqueue.append(book_id)

                # Bulk enqueue book translations
                if to_enqueue:
                    book_translations = self.queue_manager.add_translation_jobs_bulk(to_enqueue, 'book')
                    logger.info(f"Bulk enqueued {book_translations} book translation jobs")

                # Find books with untranslated chapters (only need id)
                book_ids_with_chapters = session.query(Book.id).join(Chapter).outerjoin(
                    Genre, Book.genre_id == Genre.id
                ).filter(
                    Chapter.title_translated.is_(None),
                    Chapter.title.is_not(None),
                    Chapter.title != '',
                    (Genre.blacklisted.is_(False)) | (Genre.id.is_(None)),
                ).distinct().limit(limit).all()

                # Pre-parse all chapter job IDs into {book_id: [offsets]} map
                # This avoids O(books * jobs) scanning which times out with 800k+ jobs
                from core.config import config
                batch_size = config.translation_batch_size

                scheduled_offsets_by_book = {}
                for job_id in chapter_queued_ids:
                    if '_batch_' not in job_id:
                        continue
                    try:
                        # Format: translate_chapters_{book_id}_batch_{offset}
                        parts = job_id.split('_batch_')
                        offset = int(parts[1])
                        bid = int(parts[0].split('translate_chapters_')[1])
                        scheduled_offsets_by_book.setdefault(bid, []).append(offset)
                    except (ValueError, IndexError):
                        continue

                for (book_id,) in book_ids_with_chapters:
                    # O(1) lookup instead of scanning all job IDs
                    offsets = scheduled_offsets_by_book.get(book_id, [])
                    scheduled_ranges = [(o + 1, o + batch_size) for o in offsets]

                    # Query for chapters NOT in scheduled ranges
                    q = session.query(Chapter).filter(
                        Chapter.book_id == book_id,
                        Chapter.title_translated.is_(None),
                        Chapter.title.is_not(None),
                        Chapter.title != ''
                    )
                    for start_seq, end_seq in scheduled_ranges:
                        q = q.filter(
                            ~((Chapter.sequence_number >= start_seq) &
                              (Chapter.sequence_number <= end_seq))
                        )

                    unscheduled_chapters = q.all()
                    if not unscheduled_chapters:
                        skipped_count += 1
                        continue

                    try:
                        from workers.translator import queue_unscheduled_chapter_translations
                        result = queue_unscheduled_chapter_translations(book_id, unscheduled_chapters)
                        if result['success']:
                            logger.info(f"Scheduled {result['batches_queued']} chapter translation batches for book {book_id} ({result['total_chapters']} unscheduled chapters)")
                            chapter_translations += 1
                        else:
                            logger.warning(f"Failed to schedule chapter translations for book {book_id}: {result.get('error', 'Unknown error')}")
                    except Exception as e:
                        logger.error(f"Error queuing chapter translations for book {book_id}: {e}")

        except Exception as e:
            logger.error(f"Error finding missing translations: {e}")

        return {
            'book_translations_scheduled': book_translations,
            'chapter_batches_scheduled': chapter_translations,
            'skipped': skipped_count
        }

    def find_books_to_refresh(self, hours_old: int = 24, limit: int = 10000) -> dict:
        """Find books that need refreshing based on last scrape time.
        Completed books use a 30-day cutoff, others use hours_old."""
        scheduled_count = 0
        skipped_count = 0
        books_found = 0

        try:
            queued_ids = self.queue_manager.get_all_job_ids('scraper')

            with db_manager.get_session() as session:
                cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours_old)
                completed_cutoff = datetime.now(timezone.utc) - timedelta(days=30)

                rows = session.query(Book.id, Book.url).outerjoin(
                    Genre, Book.genre_id == Genre.id
                ).filter(
                    # Completed books: stale after 30 days; others: stale after hours_old
                    or_(
                        and_(Book.status == 'completed', or_(Book.last_scraped_at < completed_cutoff, Book.last_scraped_at.is_(None))),
                        and_(Book.status != 'completed', or_(Book.last_scraped_at < cutoff_time, Book.last_scraped_at.is_(None))),
                        and_(Book.status.is_(None), or_(Book.last_scraped_at < cutoff_time, Book.last_scraped_at.is_(None))),
                    )
                ).filter(
                    Book.title_translated.is_not(None),
                    (Genre.blacklisted.is_(False)) | (Genre.id.is_(None)),
                ).order_by(Book.last_scraped_at.asc()).limit(limit).all()

                books_found = len(rows)

                # Collect jobs to enqueue, skipping already-queued
                to_enqueue = []
                for book_id, url in rows:
                    if f"refresh_book_{book_id}" in queued_ids:
                        skipped_count += 1
                        continue
                    to_enqueue.append((url, book_id))

                # Bulk enqueue via Redis pipeline
                if to_enqueue:
                    scheduled_count = self.queue_manager.add_scrape_jobs_bulk_refresh(to_enqueue)
                    logger.info(f"Bulk enqueued {scheduled_count} refresh jobs")

        except Exception as e:
            logger.error(f"Error finding books to refresh: {e}")

        return {
            'books_found': books_found,
            'scheduled': scheduled_count,
            'skipped': skipped_count
        }

    def find_books_missing_comments(self, limit: int = 10000) -> dict:
        """Find books with no comments or comments scraped >7 days ago"""
        scheduled_count = 0
        skipped_count = 0
        books_found = 0

        try:
            queued_ids = self.queue_manager.get_all_job_ids('scraper')

            with db_manager.get_session() as session:
                cutoff_time = datetime.now(timezone.utc) - timedelta(days=7)

                rows = session.query(Book.id, Book.url).outerjoin(
                    Genre, Book.genre_id == Genre.id
                ).filter(
                    (Book.last_comments_scraped_at.is_(None)) |
                    (Book.last_comments_scraped_at < cutoff_time)
                ).filter(
                    Book.url.is_not(None),
                    Book.url != '',
                    (Genre.blacklisted.is_(False)) | (Genre.id.is_(None)),
                ).order_by(Book.last_comments_scraped_at.asc().nullsfirst()).limit(limit).all()

                books_found = len(rows)

                # Collect jobs to enqueue, skipping already-queued
                to_enqueue = []
                for book_id, url in rows:
                    if f"scrape_comments_{book_id}" in queued_ids:
                        skipped_count += 1
                        continue
                    to_enqueue.append((url, book_id))

                # Bulk enqueue via Redis pipeline
                if to_enqueue:
                    scheduled_count = self.queue_manager.add_comment_scrape_jobs_bulk(to_enqueue)
                    logger.info(f"Bulk enqueued {scheduled_count} comment scrape jobs")

        except Exception as e:
            logger.error(f"Error finding books missing comments: {e}")

        return {
            'books_found': books_found,
            'scheduled': scheduled_count,
            'skipped': skipped_count
        }

    def find_untranslated_comments(self, limit: int = 1000) -> dict:
        """Find books with untranslated comments and queue batch translation jobs"""
        scheduled_count = 0
        skipped_count = 0
        books_found = 0

        try:
            # Prefetch queued comment job IDs to extract already-scheduled book IDs
            comment_queued_ids = self.queue_manager.get_all_job_ids('translation-comments')
            books_with_queued_jobs = set()
            for job_id in comment_queued_ids:
                # Format: translate_comments_{book_id}_batch_{min}_{max}
                try:
                    parts = job_id.split('_batch_')[0]
                    bid = int(parts.split('translate_comments_')[1])
                    books_with_queued_jobs.add(bid)
                except (ValueError, IndexError):
                    continue

            with db_manager.get_session() as session:
                rows = session.query(Book.id).join(BookComment).filter(
                    BookComment.content_translated.is_(None),
                    BookComment.content.is_not(None),
                    BookComment.content != ''
                ).distinct().limit(limit).all()

                books_found = len(rows)

                for (book_id,) in rows:
                    if book_id in books_with_queued_jobs:
                        skipped_count += 1
                        continue
                    try:
                        from workers.translator import queue_all_comment_translations
                        result = queue_all_comment_translations(book_id)
                        if result['success'] and result['batches_queued'] > 0:
                            logger.info(f"Scheduled {result['batches_queued']} comment translation batches for book {book_id}")
                            scheduled_count += 1
                        elif result['batches_queued'] == 0:
                            skipped_count += 1
                    except Exception as e:
                        logger.error(f"Error queuing comment translations for book {book_id}: {e}")

        except Exception as e:
            logger.error(f"Error finding untranslated comments: {e}")

        return {
            'books_found': books_found,
            'scheduled': scheduled_count,
            'skipped': skipped_count
        }

    def find_untranslated_nicknames(self, limit: int = 1000) -> dict:
        """Find books whose commenters have untranslated nicknames and queue batch translation jobs"""
        scheduled_count = 0
        skipped_count = 0
        books_found = 0

        try:
            # Prefetch queued nickname job IDs to extract already-scheduled book IDs
            nickname_queued_ids = self.queue_manager.get_all_job_ids('translation-nicknames')
            books_with_queued_jobs = set()
            for job_id in nickname_queued_ids:
                # Format: translate_nicknames_{book_id}_batch_{min}_{max}
                try:
                    parts = job_id.split('_batch_')[0]
                    bid = int(parts.split('translate_nicknames_')[1])
                    books_with_queued_jobs.add(bid)
                except (ValueError, IndexError):
                    continue

            with db_manager.get_session() as session:
                rows = session.query(Book.id).join(BookComment).join(QQUser).filter(
                    QQUser.nickname.is_not(None),
                    QQUser.nickname != '',
                    QQUser.nickname_translated.is_(None)
                ).distinct().limit(limit).all()

                books_found = len(rows)

                for (book_id,) in rows:
                    if book_id in books_with_queued_jobs:
                        skipped_count += 1
                        continue
                    try:
                        from workers.translator import queue_all_nickname_translations
                        result = queue_all_nickname_translations(book_id)
                        if result['success'] and result['batches_queued'] > 0:
                            logger.info(f"Scheduled {result['batches_queued']} nickname translation batches for book {book_id}")
                            scheduled_count += 1
                        elif result['batches_queued'] == 0:
                            skipped_count += 1
                    except Exception as e:
                        logger.error(f"Error queuing nickname translations for book {book_id}: {e}")

        except Exception as e:
            logger.error(f"Error finding untranslated nicknames: {e}")

        return {
            'books_found': books_found,
            'scheduled': scheduled_count,
            'skipped': skipped_count
        }

    def refresh_qidian_booklists(self) -> dict:
        """Orchestrate booklist processing: find booklists needing scraping and queue jobs.
        Translation is handled separately by find_booklist_missing_translations().
        """
        scrape_queued = 0
        skipped = 0

        try:
            queued_ids = self.queue_manager.get_all_job_ids('scraper-booklists')

            with db_manager.get_session() as session:
                # Find booklists needing scraping (never scraped or stale > 7 days)
                cutoff = datetime.now(timezone.utc) - timedelta(days=7)
                booklists = session.query(QidianBooklist.id, QidianBooklist.qidiantu_id).filter(
                    (QidianBooklist.last_scraped_at.is_(None)) |
                    (QidianBooklist.last_scraped_at < cutoff)
                ).all()

                # Collect IDs to enqueue, skipping already-queued
                to_enqueue = []
                for bl_id, qidiantu_id in booklists:
                    job_id = f"scrape_booklist_{qidiantu_id}"
                    if job_id in queued_ids:
                        skipped += 1
                        continue
                    to_enqueue.append(qidiantu_id)

                # Bulk enqueue via Redis pipeline
                if to_enqueue:
                    scrape_queued = self.queue_manager.add_booklist_scrape_jobs_bulk(to_enqueue)
                    logger.info(f"Bulk enqueued {scrape_queued} booklist scrape jobs")

        except Exception as e:
            logger.error(f"Error in booklist orchestration: {e}")

        result = {
            'scrape_queued': scrape_queued,
            'skipped': skipped,
        }
        logger.info(f"Qidian booklists refresh: {result}")
        return result

    def find_booklist_missing_translations(self, limit: int = 1000) -> dict:
        """Find booklists with untranslated content and queue translation jobs"""
        scheduled_count = 0
        skipped_count = 0
        booklists_found = 0

        try:
            translation_queued_ids = self.queue_manager.get_all_job_ids('translation-books')

            with db_manager.get_session() as session:
                # Booklists with untranslated title/description/tags
                bl_ids_from_booklist = set(
                    bl_id for (bl_id,) in session.query(QidianBooklist.id).filter(
                        QidianBooklist.title.is_not(None),
                        (QidianBooklist.title_translated.is_(None)) |
                        (QidianBooklist.description_translated.is_(None)) |
                        (
                            QidianBooklist.tags.is_not(None) &
                            QidianBooklist.tags_translated.is_(None)
                        )
                    ).limit(limit).all()
                )

                # Booklists with untranslated curator comments
                bl_ids_from_items = set(
                    bl_id for (bl_id,) in session.query(QidianBooklistItem.booklist_id).filter(
                        QidianBooklistItem.curator_comment.is_not(None),
                        QidianBooklistItem.curator_comment != '',
                        QidianBooklistItem.curator_comment_translated.is_(None)
                    ).distinct().limit(limit).all()
                )

                all_bl_ids = bl_ids_from_booklist | bl_ids_from_items
                booklists_found = len(all_bl_ids)

                # Collect IDs to enqueue, skipping already-queued
                to_enqueue = []
                for bl_id in all_bl_ids:
                    job_id = f"translate_booklist_{bl_id}"
                    if job_id in translation_queued_ids:
                        skipped_count += 1
                        continue
                    to_enqueue.append(bl_id)

                # Bulk enqueue via Redis pipeline
                if to_enqueue:
                    scheduled_count = self.queue_manager.add_translation_jobs_bulk(to_enqueue, 'booklist')
                    logger.info(f"Bulk enqueued {scheduled_count} booklist translation jobs")

        except Exception as e:
            logger.error(f"Error finding booklist missing translations: {e}")

        return {
            'booklists_found': booklists_found,
            'scheduled': scheduled_count,
            'skipped': skipped_count
        }

    def refresh_qq_charts(self) -> dict:
        """Queue scrape jobs for all chart page combinations.

        male/female: 5 rank types x 5 cycles x 10 pages = 250 each
        publish: 3 rank types x 5 cycles x 10 pages = 150
        Total: ~650 jobs (404s are handled gracefully)
        """
        pages = range(1, 11)

        # Prefetch all chart queue IDs once (instead of 650 individual checks)
        queued_ids = self.queue_manager.get_all_job_ids('scraper-charts')

        skipped = 0
        to_enqueue = []

        for gender, rank_types in GENDER_RANK_TYPES.items():
            for rank_type in rank_types:
                cycles = RANK_TYPE_CYCLES.get(rank_type, ['cycle-1'])
                for cycle in cycles:
                    for page in pages:
                        job_id = f"scrape_chart_{gender}_{rank_type}_{cycle}_{page}"
                        if job_id in queued_ids:
                            skipped += 1
                            continue
                        to_enqueue.append((gender, rank_type, cycle, page))

        # Bulk enqueue via Redis pipeline
        scheduled = 0
        if to_enqueue:
            scheduled = self.queue_manager.add_chart_scrape_jobs_bulk(to_enqueue)

        logger.info(f"Charts refresh: {scheduled} jobs scheduled, {skipped} skipped")
        return {'scheduled': scheduled, 'skipped': skipped}



# Worker functions for RQ
def check_missing_fields(limit: int = 50000) -> dict:
    """Orchestrator task: Find and queue books with missing fields"""
    orchestrator = MaintenanceOrchestrator()
    result = orchestrator.find_missing_fields(limit)
    logger.info(f"Missing fields check: {result}")
    return result

def check_missing_translations(limit: int = 50000) -> dict:
    """Orchestrator task: Find and queue untranslated content"""
    orchestrator = MaintenanceOrchestrator()
    result = orchestrator.find_missing_translations(limit)
    logger.info(f"Missing translations check: {result}")
    return result

def check_stale_books(hours: int = 24, limit: int = 50000) -> dict:
    """Orchestrator task: Find and queue books for refresh"""
    orchestrator = MaintenanceOrchestrator()
    result = orchestrator.find_books_to_refresh(hours, limit)
    logger.info(f"Stale books check: {result}")
    return result

def check_missing_comments(limit: int = 50000) -> dict:
    """Orchestrator task: Find and queue books missing comments"""
    orchestrator = MaintenanceOrchestrator()
    result = orchestrator.find_books_missing_comments(limit)
    logger.info(f"Missing comments check: {result}")
    return result

def check_untranslated_comments(limit: int = 10000) -> dict:
    """Orchestrator task: Find and queue untranslated comments"""
    orchestrator = MaintenanceOrchestrator()
    result = orchestrator.find_untranslated_comments(limit)
    logger.info(f"Untranslated comments check: {result}")
    return result

def check_untranslated_nicknames(limit: int = 10000) -> dict:
    """Orchestrator task: Find and queue books with untranslated QQ user nicknames"""
    orchestrator = MaintenanceOrchestrator()
    result = orchestrator.find_untranslated_nicknames(limit)
    logger.info(f"Untranslated nicknames check: {result}")
    return result

def refresh_qq_charts() -> dict:
    """Orchestrator task: Queue all chart page scraping jobs"""
    orchestrator = MaintenanceOrchestrator()
    result = orchestrator.refresh_qq_charts()
    logger.info(f"QQ charts refresh: {result}")
    return result

def check_booklist_missing_translations(limit: int = 5000) -> dict:
    """Orchestrator task: Find and queue booklists with untranslated content"""
    orchestrator = MaintenanceOrchestrator()
    result = orchestrator.find_booklist_missing_translations(limit)
    logger.info(f"Booklist missing translations check: {result}")
    return result

def refresh_qidian_booklists() -> dict:
    """Orchestrator task: Scrape all qidiantu booklists"""
    orchestrator = MaintenanceOrchestrator()
    result = orchestrator.refresh_qidian_booklists()
    logger.info(f"Qidian booklists refresh: {result}")
    return result
