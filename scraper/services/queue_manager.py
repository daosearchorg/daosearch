"""
Queue Manager - Redis queue setup and job management
"""

import logging
import redis
from rq import Queue, Retry
from core.config import config

logger = logging.getLogger(__name__)

class QueueManager:
    """
    Manages Redis queues and job dispatching
    """

    # Translation sub-queues in priority order (highest first).
    # RQ workers drain queues left-to-right, so books always go before chapters.
    TRANSLATION_QUEUES = [
        'translation-books',
        'translation-booklists',
        'translation-comments',
        'translation-nicknames',
        'translation-chapters',
    ]

    def __init__(self, redis_client=None):
        self.redis = redis_client or redis.from_url(config.redis['url'])

        # Priority scraper queues (charts > books > booklists > comments)
        self.scraper_charts_queue = Queue('scraper-charts', connection=self.redis)
        self.scraper_books_queue = Queue('scraper-books', connection=self.redis)
        self.scraper_booklists_queue = Queue('scraper-booklists', connection=self.redis)
        self.scraper_comments_queue = Queue('scraper-comments', connection=self.redis)

        self.maintenance_queue = Queue('maintenance', connection=self.redis)
        self.general_queue = Queue('general', connection=self.redis)

        # Priority translation queues
        self.translation_books_queue = Queue('translation-books', connection=self.redis)
        self.translation_booklists_queue = Queue('translation-booklists', connection=self.redis)
        self.translation_comments_queue = Queue('translation-comments', connection=self.redis)
        self.translation_nicknames_queue = Queue('translation-nicknames', connection=self.redis)
        self.translation_chapters_queue = Queue('translation-chapters', connection=self.redis)

    def add_scrape_job(self, url: str, book_id: int = None, priority: str = 'normal') -> str:
        """Add book scraping job to queue"""
        job_id = f"scrape_book_{book_id}" if book_id else None

        job = self.scraper_books_queue.enqueue(
            'workers.scraper.scrape_and_save',
            url,
            job_id=job_id,
            job_timeout='15m',
            result_ttl=60,
            failure_ttl=86400,
            retry=Retry(max=3)
        )
        return job.id

    def add_scrape_jobs_bulk(self, jobs: list[tuple[str, int]]) -> int:
        """Bulk enqueue scrape jobs using Redis pipeline. Takes list of (url, book_id) tuples."""
        if not jobs:
            return 0

        job_data_list = [
            Queue.prepare_data(
                'workers.scraper.scrape_and_save',
                args=(url,),
                job_id=f"scrape_book_{book_id}",
                timeout='15m',
                result_ttl=60,
            failure_ttl=86400,
                retry=Retry(max=3)
            )
            for url, book_id in jobs
        ]

        # enqueue_many uses a Redis pipeline internally
        enqueued = self.scraper_books_queue.enqueue_many(job_data_list)
        return len(enqueued)

    def add_scrape_jobs_bulk_refresh(self, jobs: list[tuple[str, int]]) -> int:
        """Bulk enqueue refresh jobs using Redis pipeline. Takes list of (url, book_id) tuples."""
        if not jobs:
            return 0

        job_data_list = [
            Queue.prepare_data(
                'workers.scraper.refresh_book',
                args=(url, book_id),
                job_id=f"refresh_book_{book_id}",
                timeout='10m',
                result_ttl=60,
            failure_ttl=86400,
                retry=Retry(max=2)
            )
            for url, book_id in jobs
        ]

        enqueued = self.scraper_books_queue.enqueue_many(job_data_list)
        return len(enqueued)

    def add_comment_scrape_jobs_bulk(self, jobs: list[tuple[str, int]]) -> int:
        """Bulk enqueue comment scrape jobs. Takes list of (url, book_id) tuples."""
        if not jobs:
            return 0

        job_data_list = [
            Queue.prepare_data(
                'workers.scraper.scrape_comments',
                args=(url, book_id),
                job_id=f"scrape_comments_{book_id}",
                timeout='30m',
                result_ttl=60,
            failure_ttl=86400,
                retry=Retry(max=2)
            )
            for url, book_id in jobs
        ]

        enqueued = self.scraper_comments_queue.enqueue_many(job_data_list)
        return len(enqueued)

    def add_translation_jobs_bulk(self, book_ids: list[int], job_type: str = 'book') -> int:
        """Bulk enqueue translation jobs. Takes list of book_ids."""
        if not book_ids:
            return 0

        if job_type == 'book':
            func = 'workers.translator.translate_book'
            queue = self.translation_books_queue
        elif job_type == 'booklist':
            func = 'workers.translator.translate_booklist'
            queue = self.translation_booklists_queue
        else:
            raise ValueError(f"Unknown translation job type for bulk: {job_type}")

        job_data_list = [
            Queue.prepare_data(
                func,
                args=(book_id,),
                job_id=f"translate_{job_type}_{book_id}",
                timeout='10m',
                result_ttl=60,
            failure_ttl=86400,
                retry=Retry(max=3)
            )
            for book_id in book_ids
        ]

        enqueued = queue.enqueue_many(job_data_list)
        return len(enqueued)

    def add_booklist_scrape_jobs_bulk(self, qidiantu_ids: list[int]) -> int:
        """Bulk enqueue booklist scrape jobs."""
        if not qidiantu_ids:
            return 0

        job_data_list = [
            Queue.prepare_data(
                'spiders.booklist_scraper.scrape_single_booklist',
                args=(qid,),
                job_id=f"scrape_booklist_{qid}",
                timeout='30m',
                result_ttl=60,
            failure_ttl=86400,
                retry=Retry(max=2)
            )
            for qid in qidiantu_ids
        ]

        enqueued = self.scraper_booklists_queue.enqueue_many(job_data_list)
        return len(enqueued)

    def add_chart_scrape_jobs_bulk(self, jobs: list[tuple[str, str, str, int]]) -> int:
        """Bulk enqueue chart scrape jobs. Takes list of (gender, rank_type, cycle, page) tuples."""
        if not jobs:
            return 0

        job_data_list = [
            Queue.prepare_data(
                'workers.charts_scraper.scrape_chart_page',
                args=(gender, rank_type, cycle, page),
                job_id=f"scrape_chart_{gender}_{rank_type}_{cycle}_{page}",
                timeout='10m',
                result_ttl=60,
            failure_ttl=86400,
                retry=Retry(max=2)
            )
            for gender, rank_type, cycle, page in jobs
        ]

        enqueued = self.scraper_charts_queue.enqueue_many(job_data_list)
        return len(enqueued)

    def add_translation_job(self, book_id: int, job_type: str = 'book') -> str:
        """Add translation job to queue"""
        job_id = f"translate_{job_type}_{book_id}"

        if job_type == 'book':
            job = self.translation_books_queue.enqueue(
                'workers.translator.translate_book',
                book_id,
                job_id=job_id,
                job_timeout='10m',
                result_ttl=60,
            failure_ttl=86400,
                retry=Retry(max=3)
            )
        elif job_type == 'chapters':
            job = self.translation_chapters_queue.enqueue(
                'workers.translator.translate_chapters',
                book_id,
                job_id=job_id,
                job_timeout='15m',
                result_ttl=60,
            failure_ttl=86400,
                retry=Retry(max=2)
            )
        elif job_type == 'booklist':
            job = self.translation_booklists_queue.enqueue(
                'workers.translator.translate_booklist',
                book_id,
                job_id=job_id,
                job_timeout='10m',
                result_ttl=60,
            failure_ttl=86400,
                retry=Retry(max=3)
            )
        else:
            raise ValueError(f"Unknown translation job type: {job_type}")

        return job.id

    def add_chapter_translation_job(self, book_id: int, batch_size: int = None) -> str:
        """Add chapter translation job with specific batch size"""
        job = self.translation_chapters_queue.enqueue(
            'workers.translator.translate_chapters',
            book_id,
            batch_size,
            job_timeout='15m',
            result_ttl=60,
            failure_ttl=86400,
            retry=Retry(max=2)
        )
        return job.id

    def add_chapter_translation_batch(self, book_id: int, offset: int = 0, batch_size: int = None) -> str:
        """Add chapter translation job for specific batch with offset"""
        job_id = f"translate_chapters_{book_id}_batch_{offset}"

        job = self.translation_chapters_queue.enqueue(
            'workers.translator.translate_chapters',
            book_id,
            batch_size,
            offset,
            job_id=job_id,
            job_timeout='15m',
            result_ttl=60,
            failure_ttl=86400,
            retry=Retry(max=2)
        )
        return job.id

    def add_booklist_scrape_job(self, qidiantu_id: int) -> str:
        """Add booklist scraping job to queue"""
        job_id = f"scrape_booklist_{qidiantu_id}"

        # Skip if already queued
        if self.is_job_in_queue(job_id, 'scraper-booklists'):
            logger.debug(f"Booklist scrape job already queued for {qidiantu_id}")
            return job_id

        job = self.scraper_booklists_queue.enqueue(
            'spiders.booklist_scraper.scrape_single_booklist',
            qidiantu_id,
            job_id=job_id,
            job_timeout='30m',
            result_ttl=60,
            failure_ttl=86400,
            retry=Retry(max=2)
        )
        return job.id

    def add_comment_scrape_job(self, url: str, book_id: int) -> str:
        """Add comment scraping job to queue"""
        job_id = f"scrape_comments_{book_id}"

        # Skip if already queued
        if self.is_job_in_queue(job_id, 'scraper'):
            logger.debug(f"Comment scrape job already queued for book {book_id}")
            return job_id

        job = self.scraper_comments_queue.enqueue(
            'workers.scraper.scrape_comments',
            url,
            book_id,
            job_id=job_id,
            job_timeout='30m',
            result_ttl=60,
            failure_ttl=86400,
            retry=Retry(max=2)
        )
        return job.id

    def add_comment_translation_batch(self, book_id: int, min_id: int, max_id: int) -> str:
        """Add comment translation batch job for specific ID range"""
        job_id = f"translate_comments_{book_id}_batch_{min_id}_{max_id}"

        job = self.translation_comments_queue.enqueue(
            'workers.translator.translate_comments',
            book_id,
            min_id,
            max_id,
            job_id=job_id,
            job_timeout='15m',
            result_ttl=60,
            failure_ttl=86400,
            retry=Retry(max=2)
        )
        return job.id

    def add_nickname_translation_batch(self, book_id: int, min_id: int, max_id: int) -> str:
        """Add nickname translation batch job for specific user ID range"""
        job_id = f"translate_nicknames_{book_id}_batch_{min_id}_{max_id}"

        job = self.translation_nicknames_queue.enqueue(
            'workers.translator.translate_nicknames',
            book_id,
            min_id,
            max_id,
            job_id=job_id,
            job_timeout='15m',
            result_ttl=60,
            failure_ttl=86400,
            retry=Retry(max=2)
        )
        return job.id

    def add_refresh_job(self, url: str, book_id: int) -> str:
        """Add book refresh job to queue (lightweight update check)"""
        job_id = f"refresh_book_{book_id}"

        job = self.scraper_books_queue.enqueue(
            'workers.scraper.refresh_book',
            url,
            book_id,
            job_id=job_id,
            job_timeout='10m',
            result_ttl=60,
            failure_ttl=86400,
            retry=Retry(max=2)
        )
        return job.id

    def add_chart_scrape_job(self, gender: str, rank_type: str, cycle: str, page: int = 1) -> str:
        """Add chart page scraping job to queue"""
        job_id = f"scrape_chart_{gender}_{rank_type}_{cycle}_{page}"

        job = self.scraper_charts_queue.enqueue(
            'workers.charts_scraper.scrape_chart_page',
            gender,
            rank_type,
            cycle,
            page,
            job_id=job_id,
            job_timeout='10m',
            result_ttl=60,
            failure_ttl=86400,
            retry=Retry(max=2)
        )
        return job.id

    def add_general_job(self, task_type: str, job_id: str = None, **kwargs) -> str:
        """Add general job to queue"""
        job = self.general_queue.enqueue(
            f'workers.stats.{task_type}',
            **kwargs,
            job_id=job_id,
            job_timeout='30m',
            result_ttl=60,
            failure_ttl=86400,
            retry=Retry(max=1)
        )
        return job.id

    def add_maintenance_job(self, task_type: str, **kwargs) -> str:
        """Add maintenance job to queue"""
        job = self.maintenance_queue.enqueue(
            f'workers.maintenance.{task_type}',
            **kwargs,
            job_timeout='30m',
            result_ttl=60,
            failure_ttl=86400,
            retry=Retry(max=1)
        )
        return job.id

    @property
    def _all_scraper_queues(self) -> list:
        return [self.scraper_charts_queue, self.scraper_books_queue, self.scraper_booklists_queue, self.scraper_comments_queue]

    def is_job_in_queue(self, job_id: str, queue_name: str = 'scraper') -> bool:
        """Check if job exists in any RQ registry (pending, started, deferred)"""
        queue_map = {
            'scraper': self._all_scraper_queues,
            'scraper-books': [self.scraper_books_queue],
            'scraper-booklists': [self.scraper_booklists_queue],
            'scraper-comments': [self.scraper_comments_queue],
            'scraper-charts': [self.scraper_charts_queue],
            'translation': self._all_translation_queues,
            'translation-books': [self.translation_books_queue],
            'translation-booklists': [self.translation_booklists_queue],
            'translation-comments': [self.translation_comments_queue],
            'translation-nicknames': [self.translation_nicknames_queue],
            'translation-chapters': [self.translation_chapters_queue],
            'maintenance': [self.maintenance_queue],
            'general': [self.general_queue],
        }

        queues = queue_map.get(queue_name)
        if queues is None:
            raise ValueError(f"Unknown queue name: {queue_name}")

        # Normalize to list
        if not isinstance(queues, list):
            queues = [queues]

        for queue in queues:
            if job_id in queue.get_job_ids():
                return True
            if job_id in queue.started_job_registry.get_job_ids():
                return True
            if job_id in queue.deferred_job_registry.get_job_ids():
                return True

        return False

    def get_all_job_ids(self, queue_name: str) -> set:
        """Prefetch all job IDs (pending + started + deferred) from a queue as a set.
        Much faster than calling is_job_in_queue() per item."""
        queue_map = {
            'scraper': self._all_scraper_queues,
            'scraper-books': [self.scraper_books_queue],
            'scraper-booklists': [self.scraper_booklists_queue],
            'scraper-comments': [self.scraper_comments_queue],
            'scraper-charts': [self.scraper_charts_queue],
            'translation': self._all_translation_queues,
            'translation-books': [self.translation_books_queue],
            'translation-booklists': [self.translation_booklists_queue],
            'translation-comments': [self.translation_comments_queue],
            'translation-nicknames': [self.translation_nicknames_queue],
            'translation-chapters': [self.translation_chapters_queue],
            'maintenance': [self.maintenance_queue],
            'general': [self.general_queue],
        }

        queues = queue_map.get(queue_name)
        if queues is None:
            raise ValueError(f"Unknown queue name: {queue_name}")

        ids = set()
        for queue in queues:
            ids.update(queue.get_job_ids())
            ids.update(queue.started_job_registry.get_job_ids())
            ids.update(queue.deferred_job_registry.get_job_ids())
        return ids

    def _queue_stats(self, queue: Queue) -> dict:
        """Get stats for a single queue"""
        return {
            'pending': len(queue),
            'started': queue.started_job_registry.count,
            'failed': queue.failed_job_registry.count,
            'finished': queue.finished_job_registry.count
        }

    def get_queue_stats(self) -> dict:
        """Get statistics for all queues"""
        translation_queues = {
            'translation-books': self._queue_stats(self.translation_books_queue),
            'translation-booklists': self._queue_stats(self.translation_booklists_queue),
            'translation-comments': self._queue_stats(self.translation_comments_queue),
            'translation-nicknames': self._queue_stats(self.translation_nicknames_queue),
            'translation-chapters': self._queue_stats(self.translation_chapters_queue),
        }

        return {
            'scraper-charts': self._queue_stats(self.scraper_charts_queue),
            'scraper-books': self._queue_stats(self.scraper_books_queue),
            'scraper-booklists': self._queue_stats(self.scraper_booklists_queue),
            'scraper-comments': self._queue_stats(self.scraper_comments_queue),
            **translation_queues,
            'maintenance': self._queue_stats(self.maintenance_queue),
            'general': self._queue_stats(self.general_queue),
        }

    @property
    def _all_translation_queues(self) -> list:
        return [
            self.translation_books_queue,
            self.translation_booklists_queue,
            self.translation_comments_queue,
            self.translation_nicknames_queue,
            self.translation_chapters_queue,
        ]

    def clear_failed_jobs(self, queue_name: str = None):
        """Clear failed jobs from specified queue or all queues"""
        queue_map = {
            'scraper': self._all_scraper_queues,
            'scraper-books': [self.scraper_books_queue],
            'scraper-booklists': [self.scraper_booklists_queue],
            'scraper-comments': [self.scraper_comments_queue],
            'scraper-charts': [self.scraper_charts_queue],
            'translation': self._all_translation_queues,
            'translation-books': [self.translation_books_queue],
            'translation-booklists': [self.translation_booklists_queue],
            'translation-comments': [self.translation_comments_queue],
            'translation-nicknames': [self.translation_nicknames_queue],
            'translation-chapters': [self.translation_chapters_queue],
            'maintenance': [self.maintenance_queue],
            'general': [self.general_queue],
        }

        if queue_name:
            queues = queue_map.get(queue_name, [])
        else:
            queues = self._all_scraper_queues + self._all_translation_queues + [self.maintenance_queue, self.general_queue]

        for queue in queues:
            failed_job_ids = queue.failed_job_registry.get_job_ids()
            for job_id in failed_job_ids:
                try:
                    queue.failed_job_registry.requeue(job_id)
                except Exception as e:
                    logger.warning(f"Failed to requeue job {job_id}: {e}")
                    queue.failed_job_registry.remove(job_id)

    def get_scheduled_chapter_ranges(self, book_id: int) -> list:
        """Get sequence number ranges already scheduled for translation"""
        scheduled_ranges = []

        try:
            # Check chapter translation queue
            job_ids = self.translation_chapters_queue.get_job_ids()
            started_job_ids = self.translation_chapters_queue.started_job_registry.get_job_ids()
            all_job_ids = job_ids + started_job_ids

            for job_id in all_job_ids:
                # Pattern: translate_chapters_{book_id}_batch_{offset}
                pattern = f"translate_chapters_{book_id}_batch_"
                if pattern in job_id:
                    try:
                        # Extract offset from job_id
                        offset = int(job_id.split('_batch_')[1])
                        # Each batch covers batch_size chapters starting from offset+1
                        start_seq = offset + 1
                        end_seq = offset + config.translation_batch_size
                        scheduled_ranges.append((start_seq, end_seq))
                    except (ValueError, IndexError):
                        continue

        except Exception as e:
            print(f"Error getting scheduled ranges: {e}")

        return scheduled_ranges

    def get_job_status(self, job_id: str) -> dict:
        """Get status of a specific job"""
        from rq.job import Job

        try:
            job = Job.fetch(job_id, connection=self.redis)
            return {
                'id': job.id,
                'status': job.get_status(),
                'result': job.result,
                'created_at': job.created_at,
                'ended_at': job.ended_at,
                'exc_info': job.exc_info
            }
        except Exception as e:
            return {
                'id': job_id,
                'status': 'not_found',
                'error': str(e)
            }