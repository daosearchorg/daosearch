#!/usr/bin/env python3
"""
Qidian Scraper - Main CLI application
"""

import argparse
import sys
import logging

# Fix Windows console encoding for emoji/unicode output
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
from typing import Optional

from core.config import config
from services.queue_manager import QueueManager
from workers.maintenance import check_missing_fields, check_missing_translations, check_stale_books, check_missing_comments, check_untranslated_comments, check_untranslated_nicknames, refresh_qq_charts, refresh_qidian_booklists, check_booklist_missing_translations
from workers.stats import refresh_book_stats, upload_images

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ScraperCLI:
    """CLI interface for the scraper system"""

    def __init__(self):
        self.queue_manager = QueueManager()

    def scrape_book(self, url: str) -> None:
        """Scrape a single book and save to database"""
        logger.info(f"Queueing scrape job for: {url}")

        try:
            job_id = self.queue_manager.add_scrape_job(url)
            logger.info(f"✅ Scrape job queued with ID: {job_id}")
            print(f"Book scrape job queued: {job_id}")
        except Exception as e:
            logger.error(f"Failed to queue scrape job: {e}")
            print(f"❌ Error: {e}")

    def scrape_comments(self, url: str, book_id: int) -> None:
        """Scrape comments for a specific book"""
        logger.info(f"Queueing comment scrape job for book {book_id}: {url}")

        try:
            job_id = self.queue_manager.add_comment_scrape_job(url, book_id)
            logger.info(f"✅ Comment scrape job queued with ID: {job_id}")
            print(f"Comment scrape job queued: {job_id}")
        except Exception as e:
            logger.error(f"Failed to queue comment scrape job: {e}")
            print(f"❌ Error: {e}")

    def run_maintenance(self, task_type: str, limit: int = 50) -> None:
        """Run maintenance tasks"""
        logger.info(f"Running maintenance task: {task_type}")

        try:
            if task_type == "missing-fields":
                result = check_missing_fields(limit)
                print(f"✅ Missing fields check: {result}")

            elif task_type == "missing-translations":
                result = check_missing_translations(limit)
                print(f"✅ Missing translations check: {result}")

            elif task_type == "stale-books":
                result = check_stale_books(24, limit)  # 24 hours old
                print(f"✅ Stale books check: {result}")

            elif task_type == "missing-comments":
                result = check_missing_comments(limit)
                print(f"✅ Missing comments check: {result}")

            elif task_type == "untranslated-comments":
                result = check_untranslated_comments(limit)
                print(f"✅ Untranslated comments check: {result}")

            elif task_type == "untranslated-nicknames":
                result = check_untranslated_nicknames(limit)
                print(f"✅ Untranslated nicknames check: {result}")

            elif task_type == "refresh-charts":
                result = refresh_qq_charts()
                print(f"✅ QQ charts refresh: {result}")

            elif task_type == "refresh-book-stats":
                result = refresh_book_stats(limit)
                print(f"✅ Book stats refresh: {result}")

            elif task_type == "upload-images":
                result = upload_images(limit)
                print(f"✅ Image upload: {result}")

            elif task_type == "qidian-booklists":
                result = refresh_qidian_booklists()
                print(f"✅ Qidian booklists refresh: {result}")

            elif task_type == "booklist-missing-translations":
                result = check_booklist_missing_translations(limit)
                print(f"✅ Booklist missing translations check: {result}")

            else:
                print(f"❌ Unknown maintenance task: {task_type}")

        except Exception as e:
            logger.error(f"Maintenance task failed: {e}")
            print(f"❌ Error: {e}")

    def get_queue_stats(self) -> None:
        """Display queue statistics"""
        try:
            stats = self.queue_manager.get_queue_stats()
            print("\n📊 Queue Statistics:")
            print("=" * 50)

            for queue_name, queue_stats in stats.items():
                print(f"\n🔧 {queue_name.upper()} Queue:")
                print(f"  📋 Pending: {queue_stats['pending']}")
                print(f"  ❌ Failed: {queue_stats['failed']}")
                print(f"  ✅ Finished: {queue_stats['finished']}")

        except Exception as e:
            logger.error(f"Failed to get queue stats: {e}")
            print(f"❌ Error: {e}")

    def clear_failed_jobs(self, queue_name: Optional[str] = None) -> None:
        """Clear failed jobs from queues"""
        try:
            self.queue_manager.clear_failed_jobs(queue_name)
            if queue_name:
                print(f"✅ Cleared failed jobs from {queue_name} queue")
            else:
                print("✅ Cleared failed jobs from all queues")
        except Exception as e:
            logger.error(f"Failed to clear failed jobs: {e}")
            print(f"❌ Error: {e}")

    def start_workers(self) -> None:
        """Start RQ workers (placeholder - workers should be started separately)"""
        print("🚀 To start workers, run in separate terminals:")
        print("   rq worker scraper --url redis://localhost:6379")
        print("   rq worker translation --url redis://localhost:6379")
        print("   rq worker maintenance --url redis://localhost:6379")

    def get_job_status(self, job_id: str) -> None:
        """Get status of a specific job"""
        try:
            status = self.queue_manager.get_job_status(job_id)
            print(f"\n📋 Job Status: {job_id}")
            print("=" * 40)
            print(f"Status: {status.get('status', 'unknown')}")
            print(f"Created: {status.get('created_at', 'unknown')}")
            print(f"Ended: {status.get('ended_at', 'not finished')}")
            if status.get('result'):
                print(f"Result: {status['result']}")
            if status.get('exc_info'):
                print(f"Error: {status['exc_info']}")
        except Exception as e:
            logger.error(f"Failed to get job status: {e}")
            print(f"❌ Error: {e}")

    def start_auto_scheduler(self) -> None:
        """Start the auto-scheduler"""
        print("🚀 Starting auto-scheduler...")
        print("📋 Schedule:")
        print("   • Refresh books: every 30 minutes")
        print("   • Missing fields: every 1 hour")
        print("   • Missing translations: every 1 hour")
        print("   • Missing comments: every 2 hours")
        print("   • Untranslated comments: every 2 hours")
        print("   • Untranslated nicknames: every 2 hours")
        print("   • QQ charts refresh: every 6 hours")
        print("\n🔧 Press Ctrl+C to stop")

        from services.auto_scheduler import start_auto_scheduler, stop_auto_scheduler
        start_auto_scheduler()

        try:
            # Keep running
            while True:
                import time
                time.sleep(10)
        except KeyboardInterrupt:
            print("\n🛑 Stopping auto-scheduler...")
            stop_auto_scheduler()
            print("✅ Stopped")


def create_parser() -> argparse.ArgumentParser:
    """Create command line argument parser"""
    parser = argparse.ArgumentParser(
        description="Qidian Book Scraper CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py scrape https://book.qq.com/book-detail/51637401
  python main.py scrape-comments https://book.qq.com/book-detail/51637401 --book-id 1
  python main.py maintenance missing-fields --limit 100
  python main.py maintenance missing-comments --limit 100
  python main.py maintenance untranslated-comments --limit 100
  python main.py maintenance untranslated-nicknames --limit 100
  python main.py stats
  python main.py workers

Staging Tests:
  docker-compose -f docker-compose.staging.yml up --build
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # Scrape command
    scrape_parser = subparsers.add_parser('scrape', help='Scrape a book')
    scrape_parser.add_argument('url', help='Book URL to scrape')

    # Scrape comments command
    scrape_comments_parser = subparsers.add_parser('scrape-comments', help='Scrape comments for a book')
    scrape_comments_parser.add_argument('url', help='Book URL')
    scrape_comments_parser.add_argument('--book-id', type=int, required=True, help='Book ID in database')

    # Maintenance command
    maintenance_parser = subparsers.add_parser('maintenance', help='Run maintenance tasks')
    maintenance_parser.add_argument(
        'task',
        choices=['missing-fields', 'missing-translations', 'stale-books', 'missing-comments', 'untranslated-comments', 'untranslated-nicknames', 'refresh-charts', 'refresh-book-stats', 'upload-images', 'qidian-booklists', 'booklist-missing-translations'],
        help='Maintenance task to run'
    )
    maintenance_parser.add_argument(
        '--limit',
        type=int,
        default=50000,
        help='Maximum number of items to process (default: 50000)'
    )

    # Stats command
    subparsers.add_parser('stats', help='Show queue statistics')

    # Workers command
    subparsers.add_parser('workers', help='Show worker startup commands')

    # Clear command
    clear_parser = subparsers.add_parser('clear', help='Clear failed jobs')
    clear_parser.add_argument(
        '--queue',
        choices=['scraper', 'scraper-books', 'scraper-booklists', 'scraper-comments', 'scraper-charts', 'translation', 'translation-books', 'translation-booklists', 'translation-comments', 'translation-nicknames', 'translation-chapters', 'maintenance', 'general'],
        help='Specific queue to clear (default: all). "scraper"/"translation" clear all sub-queues.'
    )

    # Job status command
    status_parser = subparsers.add_parser('status', help='Get job status')
    status_parser.add_argument('job_id', help='Job ID to check')

    # Scrape booklists command
    booklists_parser = subparsers.add_parser('scrape-booklists', help='Scrape qidiantu.com booklists')
    booklists_parser.add_argument('--list', type=int, dest='list_id', help='Single booklist ID to scrape')

    # Discover command
    subparsers.add_parser('discover', help='Run full-site discovery crawl')

    # Discovery URL stats command
    discovery_stats_parser = subparsers.add_parser('discovery-stats', help='Show discovery URL prefix tracking stats')
    discovery_stats_parser.add_argument('--sort', choices=['hits', 'misses', 'total', 'rate'], default='misses', help='Sort by (default: misses)')
    discovery_stats_parser.add_argument('--blocked', action='store_true', help='Show only blocked prefixes')
    discovery_stats_parser.add_argument('--unblock', type=str, help='Unblock a prefix')
    discovery_stats_parser.add_argument('--reset', action='store_true', help='Reset all tracking data')

    # Scheduler command
    scheduler_parser = subparsers.add_parser('scheduler', help='Auto-scheduler controls')
    scheduler_parser.add_argument(
        'action',
        choices=['start'],
        help='Scheduler action'
    )

    return parser


def main():
    """Main CLI entry point"""
    parser = create_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    try:
        cli = ScraperCLI()

        if args.command == 'scrape':
            cli.scrape_book(args.url)

        elif args.command == 'scrape-comments':
            cli.scrape_comments(args.url, args.book_id)

        elif args.command == 'maintenance':
            cli.run_maintenance(args.task, args.limit)

        elif args.command == 'stats':
            cli.get_queue_stats()

        elif args.command == 'workers':
            cli.start_workers()

        elif args.command == 'clear':
            cli.clear_failed_jobs(args.queue)

        elif args.command == 'status':
            cli.get_job_status(args.job_id)

        elif args.command == 'scrape-booklists':
            from spiders.booklist_scraper import QidiantuBooklistScraper
            scraper = QidiantuBooklistScraper()
            if args.list_id:
                print(f"Scraping single booklist: {args.list_id}")
                result = scraper.scrape_single_booklist(args.list_id)
            else:
                print("Scraping all booklists from qidiantu.com...")
                result = scraper.scrape_all_booklists()
            print(f"Result: {result}")

        elif args.command == 'discover':
            from spiders.discovery import run_discovery
            print("Starting full-site discovery crawl...")
            run_discovery()

        elif args.command == 'discovery-stats':
            from spiders.discovery import URL_STATS_KEY, URL_BLOCKED_KEY
            import redis as redis_lib
            r = redis_lib.from_url(config.redis['url'])

            if args.reset:
                r.delete(URL_STATS_KEY)
                r.delete(URL_BLOCKED_KEY)
                print("Reset all discovery URL tracking data")
                return

            if args.unblock:
                r.srem(URL_BLOCKED_KEY, args.unblock)
                print(f"Unblocked prefix: {args.unblock}")
                return

            blocked = {p.decode() if isinstance(p, bytes) else p for p in r.smembers(URL_BLOCKED_KEY)}

            if args.blocked:
                if blocked:
                    print(f"\nBlocked prefixes ({len(blocked)}):")
                    for p in sorted(blocked):
                        print(f"  {p}")
                else:
                    print("No blocked prefixes")
                return

            raw_stats = r.hgetall(URL_STATS_KEY)
            if not raw_stats:
                print("No discovery URL stats yet")
                return

            rows = []
            for prefix, val in raw_stats.items():
                prefix = prefix.decode() if isinstance(prefix, bytes) else prefix
                val = val.decode() if isinstance(val, bytes) else val
                hits, misses = map(int, val.split(':'))
                total = hits + misses
                rate = (hits / total * 100) if total > 0 else 0
                is_blocked = prefix in blocked
                rows.append((prefix, hits, misses, total, rate, is_blocked))

            sort_key = {'hits': 1, 'misses': 2, 'total': 3, 'rate': 4}[args.sort]
            rows.sort(key=lambda x: x[sort_key], reverse=True)

            print(f"\nDiscovery URL Prefix Stats ({len(rows)} prefixes, {len(blocked)} blocked):")
            print(f"{'PREFIX':<40} {'HITS':>6} {'MISSES':>8} {'TOTAL':>7} {'RATE':>7} {'STATUS'}")
            print("-" * 85)
            for prefix, hits, misses, total, rate, is_blocked in rows:
                status = "BLOCKED" if is_blocked else ""
                print(f"{prefix:<40} {hits:>6} {misses:>8} {total:>7} {rate:>6.1f}% {status}")

        elif args.command == 'scheduler':
            if args.action == 'start':
                cli.start_auto_scheduler()

    except KeyboardInterrupt:
        print("\n🛑 Operation cancelled by user")
        sys.exit(1)

    except Exception as e:
        logger.error(f"CLI error: {e}")
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()