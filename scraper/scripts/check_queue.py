#!/usr/bin/env python3
"""
Check pending jobs in Redis queues
Uses remote database credentials from .env.remote
"""

import os
from rq import Queue
from redis import Redis

# Set environment to use remote credentials
os.environ['ENV'] = 'remote'

from core.config import config

def main():
    print("🔍 Checking Redis queue status...")
    print(f"📍 Connecting to: {config.redis['url']}")

    # Connect to Redis
    redis_conn = Redis.from_url(config.redis['url'])

    # Check each queue
    queues = ['scraper', 'translation', 'maintenance']

    print("\n" + "="*60)
    for queue_name in queues:
        queue = Queue(queue_name, connection=redis_conn)

        print(f"\n📋 Queue: {queue_name}")
        print(f"   Total jobs: {len(queue)}")
        print(f"   Started jobs: {queue.started_job_registry.count}")
        print(f"   Failed jobs: {queue.failed_job_registry.count}")
        print(f"   Finished jobs: {queue.finished_job_registry.count}")
        print(f"   Scheduled jobs: {queue.scheduled_job_registry.count}")

        # Show pending jobs
        if len(queue) > 0:
            print("\n   📝 Pending jobs (first 10):")
            for i, job in enumerate(queue.jobs[:10]):
                print(f"      {i+1}. {job.id} - {job.func_name} - Status: {job.get_status()}")

        # Show running jobs
        if queue.started_job_registry.count > 0:
            print("\n   ▶️  Running jobs:")
            for job_id in queue.started_job_registry.get_job_ids():
                job = queue.fetch_job(job_id)
                if job:
                    print(f"      - {job.id} - {job.func_name}")

        # Show failed jobs
        if queue.failed_job_registry.count > 0:
            print("\n   ❌ Failed jobs (last 5):")
            for job_id in list(queue.failed_job_registry.get_job_ids())[:5]:
                job = queue.fetch_job(job_id)
                if job:
                    print(f"      - {job.id} - {job.func_name}")
                    if job.exc_info:
                        print(f"        Error: {job.exc_info[:200]}")

    print("\n" + "="*60)

    # Check worker status
    print("\n👷 Active workers:")
    from rq import Worker
    workers = Worker.all(connection=redis_conn)
    if workers:
        for worker in workers:
            print(f"   - {worker.name} (State: {worker.get_state()})")
            if worker.get_current_job():
                job = worker.get_current_job()
                print(f"     Currently processing: {job.func_name} ({job.id})")
    else:
        print("   ⚠️  No active workers found!")

if __name__ == "__main__":
    main()
