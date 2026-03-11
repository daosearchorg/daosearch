#!/usr/bin/env python3
"""
Script to schedule a missing fields maintenance job
Uses remote database credentials from .env.remote
"""

import os

from services.queue_manager import QueueManager

# Set environment to use remote credentials
os.environ['ENV'] = 'remote'

def main():
    print("🔧 Scheduling missing fields orchestration job...")
    print("📍 Using remote database credentials (.env.remote)")

    # Initialize queue manager
    queue_manager = QueueManager()

    # Schedule the maintenance job - the maintenance worker will handle finding and scheduling
    print("\n📋 Scheduling missing fields orchestration job...")
    job_id = queue_manager.add_maintenance_job('check_missing_fields', limit=1000)
    print(f"✅ Maintenance job queued with ID: {job_id}")
    print("🤖 Maintenance worker will find books with missing fields and schedule scraping jobs")
    print("🔢 Will process up to 1000 books with missing fields")

    # Show queue stats
    print("\n📊 Current queue statistics:")
    stats = queue_manager.get_queue_stats()
    for queue_name, queue_stats in stats.items():
        print(f"   {queue_name}: {queue_stats['pending']} pending, {queue_stats['started']} running")

if __name__ == "__main__":
    main()