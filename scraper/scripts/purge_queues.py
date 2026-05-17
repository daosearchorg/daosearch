"""Purge ALL RQ queues, registries, jobs and locks — start fresh.

Clears every scraper + translation + maintenance + general queue, all their
registries (pending/started/deferred/finished/failed/scheduled), every
rq:job:* hash and every rq:lock:* key. Does NOT touch operational state
(proxy pool, qidian cookie, dead-book blacklist).

Run (cwd = scraper/): .venv/Scripts/python.exe scripts/purge_queues.py
"""
import sys
sys.path.insert(0, ".")

import redis
from rq import Queue
from rq.registry import (
    StartedJobRegistry, FinishedJobRegistry, FailedJobRegistry,
    DeferredJobRegistry, ScheduledJobRegistry,
)

from core.config import config

QUEUES = [
    'scraper-charts', 'scraper-books', 'scraper-booklists',
    'scraper-comments', 'scraper-mapping', 'scraper-qidian-charts',
    'translation-books', 'translation-booklists', 'translation-comments',
    'translation-nicknames', 'translation-chapters',
    'maintenance', 'general',
]
REGISTRIES = (StartedJobRegistry, FinishedJobRegistry, FailedJobRegistry,
              DeferredJobRegistry, ScheduledJobRegistry)


def main():
    r = redis.from_url(config.redis['url'])
    total_pending = 0
    total_reg = 0

    for qname in QUEUES:
        q = Queue(qname, connection=r)
        n = len(q)
        q.empty()
        total_pending += n
        freed = 0
        for Reg in REGISTRIES:
            reg = Reg(qname, connection=r)
            for jid in reg.get_job_ids():
                try:
                    reg.remove(jid, delete_job=True)
                except Exception:
                    try:
                        reg.remove(jid)
                    except Exception:
                        pass
                freed += 1
        total_reg += freed
        print(f"  {qname}: emptied {n} pending, {freed} registry jobs")

    # Stray job hashes + RQ locks
    job_keys = list(r.scan_iter('rq:job:*', count=1000))
    if job_keys:
        for i in range(0, len(job_keys), 5000):
            r.delete(*job_keys[i:i + 5000])
    lock_keys = list(r.scan_iter('rq:lock:*', count=1000))
    if lock_keys:
        r.delete(*lock_keys)

    print(f"\nDONE: {total_pending} pending + {total_reg} registry jobs cleared, "
          f"{len(job_keys)} rq:job:* deleted, {len(lock_keys)} rq:lock:* deleted")


if __name__ == "__main__":
    main()
