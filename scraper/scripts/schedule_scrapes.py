#!/usr/bin/env python3
"""
Script to manually schedule scrape jobs for books
Uses remote database credentials from .env.remote
"""

import os

# Set environment to use remote credentials
os.environ['ENV'] = 'local'

from services.queue_manager import QueueManager

def main():
    print("📚 Schedule Book Scraping Jobs")
    print("=" * 60)
    print("📍 Using remote database credentials (.env.remote)")
    print()
    print("Enter book URLs (space-separated for multiple URLs):")
    print("Example: https://book.qq.com/book-detail/123 https://book.qq.com/book-detail/456")
    print()

    # Get URLs from user input
    url_input = input("URLs: ").strip()

    if not url_input:
        print("❌ No URLs provided. Exiting.")
        return

    # Split by spaces to get individual URLs
    urls = url_input.split()

    print(f"\n📋 Found {len(urls)} URL(s) to process")
    print("=" * 60)

    # Initialize queue manager
    queue_manager = QueueManager()

    # Schedule each URL
    scheduled = 0
    failed = 0

    for i, url in enumerate(urls, 1):
        url = url.strip()
        if not url:
            continue

        try:
            print(f"\n[{i}/{len(urls)}] Scheduling: {url}")
            job_id = queue_manager.add_scrape_job(url)
            print(f"   ✅ Job queued with ID: {job_id}")
            scheduled += 1
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            failed += 1

    # Summary
    print("\n" + "=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    print(f"✅ Successfully scheduled: {scheduled}")
    if failed > 0:
        print(f"❌ Failed: {failed}")

    # Show queue stats
    print("\n📊 Current queue statistics:")
    stats = queue_manager.get_queue_stats()
    for queue_name, queue_stats in stats.items():
        print(f"   {queue_name}: {queue_stats['pending']} pending, {queue_stats['started']} running")

if __name__ == "__main__":
    main()
