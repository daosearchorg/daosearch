"""Custom worker pool launcher using SimpleWorker (no fork-per-job).

- RecyclingSimpleWorker: exits after MAX_JOBS to release accumulated memory
- StaggeredWorkerPool: spawns workers gradually to avoid CPU startup spikes
"""
import sys
import time
import logging
from redis import Redis
from rq.worker import SimpleWorker
from rq.worker_pool import WorkerPool
from core.config import config

logger = logging.getLogger(__name__)

# Spawn at most this many workers per batch during startup.
SPAWN_BATCH_SIZE = 2
SPAWN_DELAY = 2  # seconds between batches

WORKER_QUEUES = {
    'scraper': ['scraper-charts', 'scraper-books', 'scraper-booklists', 'scraper-comments'],
    'translation': ['translation-books', 'translation-booklists', 'translation-comments', 'translation-nicknames', 'translation-chapters'],
    'maintenance': ['maintenance'],
    'general': ['general'],
}


class StaggeredWorkerPool(WorkerPool):
    """WorkerPool that spawns workers gradually instead of all at once."""

    def start(self, *args, **kwargs):
        # Stagger initial spawn: start with a small pool, then grow
        target = self.num_workers
        if target <= SPAWN_BATCH_SIZE:
            # Small pool, no need to stagger
            return super().start(*args, **kwargs)

        # Start with first batch, then ramp up
        self.num_workers = SPAWN_BATCH_SIZE
        logger.info(f"Staggered startup: spawning {target} workers in batches of {SPAWN_BATCH_SIZE}")

        # We need to override the start loop, so we do the ramp-up in a thread
        # before calling super().start(). Use a simpler approach: just spawn
        # the pool at full size but with a patched _start_worker that sleeps.
        self.num_workers = target
        self._workers_spawned = 0
        return super().start(*args, **kwargs)

    def _start_worker(self, *args, **kwargs):
        """Add a delay between worker spawns to stagger startup."""
        if self._workers_spawned > 0 and self._workers_spawned % SPAWN_BATCH_SIZE == 0:
            logger.info(f"Spawned {self._workers_spawned}/{self.num_workers} workers, pausing {SPAWN_DELAY}s...")
            time.sleep(SPAWN_DELAY)
        self._workers_spawned += 1
        return super()._start_worker(*args, **kwargs)


def start_pool(worker_name: str, num_workers: int):
    redis_conn = Redis.from_url(config.redis['url'])
    queues = WORKER_QUEUES.get(worker_name, [worker_name])

    pool = StaggeredWorkerPool(
        queues=queues,
        connection=redis_conn,
        num_workers=num_workers,
        worker_class=SimpleWorker,
    )
    pool.start(burst=False, logging_level='INFO')

if __name__ == '__main__':
    start_pool(sys.argv[1], int(sys.argv[2]))
