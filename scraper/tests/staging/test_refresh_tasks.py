"""
Refresh Tasks Tests
Tests the system's ability to detect and refresh stale books
"""

import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Any

from core.database import db_manager
from core.models import Book
from services.queue_manager import QueueManager
from workers.maintenance import check_stale_books
from .data_setup import TestDataPreparer

logger = logging.getLogger(__name__)

class RefreshTasksTest:
    """Test stale book detection and refresh functionality"""

    def __init__(self):
        self.db = db_manager
        self.queue_manager = QueueManager()
        self.preparer = TestDataPreparer()

    def test_stale_book_detection(self, hours_threshold: int = 48) -> Dict[str, Any]:
        """Test detection of stale books that need refreshing"""
        logger.info(f"Starting stale book detection test (threshold: {hours_threshold}h)")

        results = {
            "test_name": "stale_book_detection",
            "timestamp": time.time(),
            "threshold_hours": hours_threshold,
            "steps": {},
            "success": False,
            "errors": []
        }

        try:
            # Step 1: Get initial database state
            initial_stats = self.preparer.get_database_stats()
            results["steps"]["initial_stats"] = initial_stats
            logger.info(f"Initial database stats: {initial_stats}")

            # Step 2: Prepare test data (make books appear stale)
            logger.info("Preparing test data by making books appear stale")
            preparation_result = self.preparer.prepare_refresh_test(
                hours_threshold=hours_threshold,
                limit=3
            )
            results["steps"]["data_preparation"] = preparation_result

            modified_books = preparation_result["modifications"]
            if not modified_books:
                raise Exception("No books were made stale during preparation")

            # Step 3: Verify books are now considered stale
            stale_book_ids = [book["book_id"] for book in modified_books]
            stale_verification = self._verify_books_are_stale(stale_book_ids, hours_threshold)
            results["steps"]["stale_verification"] = stale_verification

            if not stale_verification["all_stale"]:
                results["errors"].append("Some books are not properly marked as stale")

            # Step 4: Run stale book detection
            logger.info("Running stale book detection maintenance task")
            detection_result = check_stale_books(hours_threshold, limit=100)
            results["steps"]["detection_result"] = detection_result

            # Step 5: Verify scraping jobs were created
            logger.info("Checking if scraping jobs were created")
            queue_stats = self.queue_manager.get_queue_stats()
            results["steps"]["queue_stats_after_detection"] = queue_stats

            scraping_jobs = queue_stats.get("scraper", {}).get("pending", 0)
            if scraping_jobs == 0:
                results["errors"].append("No scraping jobs were created despite stale books")

            # Step 6: Validate detection effectiveness
            validation_result = self._validate_stale_detection(
                modified_books, detection_result, scraping_jobs
            )
            results["steps"]["validation"] = validation_result

            results["success"] = validation_result["passed"] and len(results["errors"]) == 0

            if results["success"]:
                logger.info("Stale book detection test PASSED")
            else:
                logger.warning(f"Stale book detection test FAILED: {results['errors']}")

        except Exception as e:
            error_msg = f"Stale book detection test failed: {str(e)}"
            logger.error(error_msg)
            results["errors"].append(error_msg)
            results["success"] = False

        return results

    def test_book_refresh_completion(self, hours_threshold: int = 48) -> Dict[str, Any]:
        """Test completion of book refresh process (if workers are running)"""
        logger.info("Starting book refresh completion test")

        results = {
            "test_name": "book_refresh_completion",
            "timestamp": time.time(),
            "threshold_hours": hours_threshold,
            "steps": {},
            "success": False,
            "errors": []
        }

        try:
            # Step 1: Prepare test data
            preparation_result = self.preparer.prepare_refresh_test(
                hours_threshold=hours_threshold,
                limit=2
            )
            results["steps"]["data_preparation"] = preparation_result

            modified_books = preparation_result["modifications"]
            book_ids = [book["book_id"] for book in modified_books]

            # Step 2: Run detection to queue refresh jobs
            detection_result = check_stale_books(hours_threshold, limit=50)
            results["steps"]["detection_result"] = detection_result

            # Step 3: Wait for workers to process jobs
            logger.info("Waiting for workers to process refresh jobs...")
            max_wait_time = 90  # seconds
            wait_time = 0
            check_interval = 10

            refresh_stats = {
                "books_refreshed": 0,
                "books_pending": len(book_ids),
                "last_scraped_updates": []
            }

            while wait_time < max_wait_time:
                time.sleep(check_interval)
                wait_time += check_interval

                # Check if books have been refreshed (last_scraped_at updated)
                with self.db.get_session() as session:
                    books = session.query(Book).filter(Book.id.in_(book_ids)).all()
                    refreshed_count = 0

                    for book in books:
                        if book.last_scraped_at:
                            # Check if last_scraped_at is recent (within last 5 minutes)
                            time_diff = datetime.now(timezone.utc) - book.last_scraped_at
                            if time_diff.total_seconds() < 300:  # 5 minutes
                                refreshed_count += 1
                                refresh_stats["last_scraped_updates"].append({
                                    "book_id": book.id,
                                    "new_scraped_at": book.last_scraped_at.isoformat(),
                                    "time_since_refresh": time_diff.total_seconds()
                                })

                    refresh_stats["books_refreshed"] = refreshed_count
                    refresh_stats["books_pending"] = len(book_ids) - refreshed_count

                    refresh_rate = refreshed_count / len(book_ids) if book_ids else 0
                    logger.info(f"Refresh rate after {wait_time}s: {refresh_rate:.1%}")

                    if refresh_rate >= 0.5:  # 50% refresh threshold
                        logger.info("Sufficient books refreshed")
                        break

            results["steps"]["refresh_stats"] = refresh_stats

            # Step 4: Final validation
            validation_result = self._validate_refresh_completion(book_ids, refresh_stats)
            results["steps"]["validation"] = validation_result

            results["success"] = validation_result["passed"]

            if results["success"]:
                logger.info("Book refresh completion test PASSED")
            else:
                logger.warning(f"Book refresh completion test FAILED: {validation_result['issues']}")

        except Exception as e:
            error_msg = f"Book refresh completion test failed: {str(e)}"
            logger.error(error_msg)
            results["errors"].append(error_msg)
            results["success"] = False

        return results


    def _verify_books_are_stale(self, book_ids: list, hours_threshold: int) -> Dict[str, Any]:
        """Verify that books are properly marked as stale"""
        with self.db.get_session() as session:
            threshold_time = datetime.now(timezone.utc) - timedelta(hours=hours_threshold)
            books = session.query(Book).filter(Book.id.in_(book_ids)).all()

            verification = {
                "total_books": len(books),
                "stale_books": 0,
                "all_stale": False,
                "book_details": []
            }

            for book in books:
                is_stale = (book.last_scraped_at is None or
                           book.last_scraped_at < threshold_time)

                verification["book_details"].append({
                    "book_id": book.id,
                    "last_scraped_at": book.last_scraped_at.isoformat() if book.last_scraped_at else None,
                    "is_stale": is_stale
                })

                if is_stale:
                    verification["stale_books"] += 1

            verification["all_stale"] = verification["stale_books"] == verification["total_books"]
            return verification

    def _validate_stale_detection(self, modified_books: list, detection_result: dict,
                                 scraping_jobs: int) -> Dict[str, Any]:
        """Validate the stale book detection results"""
        validation = {
            "passed": True,
            "issues": [],
            "metrics": {}
        }

        try:
            books_made_stale = len(modified_books)

            # Check if books were actually modified
            if books_made_stale == 0:
                validation["issues"].append("No books were made stale during preparation")
                validation["passed"] = False

            # Check if scraping jobs were created
            if scraping_jobs == 0:
                validation["issues"].append("No scraping jobs were created")
                validation["passed"] = False

            # Calculate metrics
            validation["metrics"] = {
                "books_made_stale": books_made_stale,
                "scraping_jobs_created": scraping_jobs,
                "detection_effectiveness": scraping_jobs / max(books_made_stale, 1)
            }

            # Success criteria: at least some jobs created
            if len(validation["issues"]) == 0 and scraping_jobs > 0:
                validation["passed"] = True
            else:
                validation["passed"] = False

        except Exception as e:
            validation["issues"].append(f"Validation error: {str(e)}")
            validation["passed"] = False

        return validation

    def _validate_refresh_completion(self, book_ids: list, refresh_stats: dict) -> Dict[str, Any]:
        """Validate the refresh completion results"""
        validation = {
            "passed": True,
            "issues": [],
            "metrics": refresh_stats
        }

        try:
            total_books = len(book_ids)
            refreshed_books = refresh_stats["books_refreshed"]

            if total_books == 0:
                validation["issues"].append("No books to test refresh completion")
                validation["passed"] = False
                return validation

            refresh_rate = refreshed_books / total_books

            # Success criteria: at least 30% of books refreshed
            if refresh_rate < 0.3:
                validation["issues"].append(f"Low refresh rate: {refresh_rate:.1%}")
                validation["passed"] = False

            validation["metrics"]["refresh_rate"] = refresh_rate

        except Exception as e:
            validation["issues"].append(f"Validation error: {str(e)}")
            validation["passed"] = False

        return validation

    def run_all_refresh_tests(self) -> Dict[str, Any]:
        """Run all refresh-related tests"""
        logger.info("Running all refresh tests")

        results = {
            "test_suite": "refresh_tasks",
            "timestamp": time.time(),
            "tests": {},
            "success": False
        }

        # Run detection test (includes job queuing verification)
        detection_result = self.test_stale_book_detection()
        results["tests"]["detection"] = detection_result

        # Run completion test
        completion_result = self.test_book_refresh_completion()
        results["tests"]["completion"] = completion_result

        # Overall success
        results["success"] = (
            detection_result["success"] and
            completion_result["success"]
        )

        return results

def main():
    """Main function for CLI usage"""
    import argparse

    parser = argparse.ArgumentParser(description='Run refresh tasks tests')
    parser.add_argument('--test', choices=['detection', 'completion', 'all'],
                       default='all', help='Which test to run')
    parser.add_argument('--threshold', type=int, default=48,
                       help='Hours threshold for stale book detection')
    parser.add_argument('--verbose', action='store_true', help='Verbose logging')

    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(level=log_level, format='%(asctime)s - %(levelname)s - %(message)s')

    tester = RefreshTasksTest()

    if args.test == 'detection':
        results = tester.test_stale_book_detection(args.threshold)
    elif args.test == 'completion':
        results = tester.test_book_refresh_completion(args.threshold)
    elif args.test == 'queuing':
        results = tester.test_refresh_job_queuing()
    else:
        results = tester.run_all_refresh_tests()

    print(json.dumps(results, indent=2, default=str))

if __name__ == '__main__':
    main()