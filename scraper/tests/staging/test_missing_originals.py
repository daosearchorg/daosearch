"""
Missing Original Fields Detection Tests
Tests the system's ability to detect and fix missing original scraped fields
"""

import json
import logging
import time
from typing import Dict, Any

from core.database import db_manager
from core.models import Book
from services.queue_manager import QueueManager
from workers.maintenance import check_missing_fields
from .data_setup import TestDataPreparer

logger = logging.getLogger(__name__)

class MissingOriginalsTest:
    """Test missing original fields detection and completion"""

    def __init__(self):
        self.db = db_manager
        self.queue_manager = QueueManager()
        self.preparer = TestDataPreparer()

    def test_missing_originals_detection(self) -> Dict[str, Any]:
        """Test detection of missing original scraped fields"""
        logger.info("Starting missing originals detection test")

        results = {
            "test_name": "missing_originals_detection",
            "timestamp": time.time(),
            "steps": {},
            "success": False,
            "errors": []
        }

        try:
            # Step 1: Get initial database state and verify data exists
            initial_stats = self.preparer.get_database_stats()
            results["steps"]["initial_stats"] = initial_stats
            logger.info(f"Initial database stats: {initial_stats}")

            # Check if we have sufficient data for testing (at least as many books as configured)
            min_books_needed = self.preparer.num_test_books
            if initial_stats["books"]["total"] < min_books_needed:
                error_msg = f"Insufficient data for testing: only {initial_stats['books']['total']} books found, need at least {min_books_needed}"
                logger.error(error_msg)
                results["errors"].append(error_msg)
                results["success"] = False
                return results

            # Wait for translation queue to be empty (all translations complete)
            logger.info("Waiting for all translations to complete before running missing originals test...")

            wait_timeout = 300
            wait_start = time.time()

            while time.time() - wait_start < wait_timeout:
                queue_stats = self.queue_manager.get_queue_stats()
                translation_stats = queue_stats.get('translation', {})
                pending = translation_stats.get('pending', 0)
                started = translation_stats.get('started', 0)
                total_active = pending + started

                if total_active == 0:
                    logger.info("✅ Translation queue is empty - all translations complete")
                    # Update initial stats after translations are done
                    initial_stats = self.preparer.get_database_stats()
                    results["steps"]["initial_stats"] = initial_stats
                    break

                logger.info(f"Waiting for {total_active} translation jobs to complete (pending: {pending}, started: {started})")
                time.sleep(10)
            else:
                error_msg = f"Translation queue did not empty within {wait_timeout} seconds"
                logger.error(error_msg)
                results["errors"].append(error_msg)
                results["success"] = False
                return results

            # Final check for sufficient translated books
            if initial_stats["books"]["with_translations"] < 2:
                error_msg = f"Still insufficient translated books: only {initial_stats['books']['with_translations']} books with translations, need at least 2"
                logger.error(error_msg)
                results["errors"].append(error_msg)
                results["success"] = False
                return results

            # Step 2: Prepare test data (remove fields)
            logger.info("Preparing test data by removing original scraped fields")
            preparation_result = self.preparer.prepare_missing_original_fields_test(limit=3)
            results["steps"]["data_preparation"] = preparation_result

            modified_books = preparation_result["modifications"]
            if not modified_books:
                raise Exception("No books were modified during preparation")

            # Step 3: Run missing fields detection
            logger.info("Running missing fields detection maintenance task")
            detection_result = check_missing_fields(limit=100)
            results["steps"]["detection_result"] = detection_result

            # Step 4: Verify jobs were created
            logger.info("Checking if scraping jobs were created")
            queue_stats = self.queue_manager.get_queue_stats()
            results["steps"]["queue_stats_after_detection"] = queue_stats

            scraping_jobs = queue_stats.get("scraper", {}).get("pending", 0)
            if scraping_jobs == 0:
                results["errors"].append("No scraping jobs were created despite missing fields")

            # Step 5: Wait for job processing (simulate)
            logger.info("Waiting for potential job processing...")
            time.sleep(5)  # Give workers time to process if running

            # Step 6: Check current database state
            final_stats = self.preparer.get_database_stats()
            results["steps"]["final_stats"] = final_stats

            # Step 7: Validate results
            validation_result = self._validate_missing_originals_test(
                modified_books, initial_stats, final_stats, scraping_jobs
            )
            results["steps"]["validation"] = validation_result

            results["success"] = validation_result["passed"]

            if results["success"]:
                logger.info("Missing originals detection test PASSED")
            else:
                logger.warning(f"Missing originals detection test FAILED: {validation_result['issues']}")

        except Exception as e:
            error_msg = f"Missing originals test failed: {str(e)}"
            logger.error(error_msg)
            results["errors"].append(error_msg)
            results["success"] = False

        return results

    def test_missing_originals_completion(self) -> Dict[str, Any]:
        """Test completion of missing original fields restoration (if workers are running)"""
        logger.info("Starting missing originals completion test")

        results = {
            "test_name": "missing_originals_completion",
            "timestamp": time.time(),
            "steps": {},
            "success": False,
            "errors": []
        }

        try:
            # Step 1: Check if data exists from scraping test and wait for translations
            initial_stats = self.preparer.get_database_stats()
            if initial_stats["books"]["total"] < 2:
                error_msg = f"Insufficient data: only {initial_stats['books']['total']} books found. Scraping test must run first."
                logger.error(error_msg)
                results["errors"].append(error_msg)
                results["success"] = False
                return results

            # Wait for translation queue to be empty before modifying data
            logger.info("Waiting for all translations to complete before running completion test...")

            wait_timeout = 300
            wait_start = time.time()

            while time.time() - wait_start < wait_timeout:
                queue_stats = self.queue_manager.get_queue_stats()
                translation_stats = queue_stats.get('translation', {})
                pending = translation_stats.get('pending', 0)
                started = translation_stats.get('started', 0)
                total_active = pending + started

                if total_active == 0:
                    logger.info("✅ Translation queue is empty - all translations complete")
                    # Update initial stats after translations are done
                    initial_stats = self.preparer.get_database_stats()
                    break

                time.sleep(10)
            else:
                error_msg = f"Translation queue did not empty within {wait_timeout} seconds"
                logger.error(error_msg)
                results["errors"].append(error_msg)
                results["success"] = False
                return results

            # Final check for sufficient translated books
            if initial_stats["books"]["with_translations"] < 2:
                error_msg = f"Insufficient translated books: only {initial_stats['books']['with_translations']} books with translations, need at least 2"
                logger.error(error_msg)
                results["errors"].append(error_msg)
                results["success"] = False
                return results

            # Step 2: Prepare test data
            preparation_result = self.preparer.prepare_missing_original_fields_test(limit=2)
            results["steps"]["data_preparation"] = preparation_result

            modified_books = preparation_result["modifications"]
            book_ids = [book["book_id"] for book in modified_books]

            # Step 2: Run detection
            detection_result = check_missing_fields(limit=50)
            results["steps"]["detection_result"] = detection_result

            # Step 3: Wait for workers to process jobs
            logger.info("Waiting for workers to process scraping jobs...")
            max_wait_time = 60  # seconds
            wait_time = 0
            check_interval = 5

            while wait_time < max_wait_time:
                time.sleep(check_interval)
                wait_time += check_interval

                # Check if original fields have been restored
                with self.db.get_session() as session:
                    books = session.query(Book).filter(Book.id.in_(book_ids)).all()
                    completed_count = 0

                    for book in books:
                        if (book.title and book.title != '' and
                            book.author and book.author != '' and
                            book.synopsis and book.synopsis != ''):
                            completed_count += 1

                    completion_rate = completed_count / len(books) if books else 0
                    logger.info(f"Completion rate after {wait_time}s: {completion_rate:.1%}")

                    if completion_rate >= 0.8:  # 80% completion threshold
                        logger.info("Sufficient original fields restored")
                        break

            # Step 4: Final validation
            with self.db.get_session() as session:
                final_books = session.query(Book).filter(Book.id.in_(book_ids)).all()
                completion_stats = {
                    "total_books": len(final_books),
                    "fully_restored": 0,
                    "partially_restored": 0,
                    "not_restored": 0
                }

                for book in final_books:
                    restored_fields = sum([
                        bool(book.title and book.title != ''),
                        bool(book.author and book.author != ''),
                        bool(book.synopsis and book.synopsis != '')
                    ])

                    if restored_fields == 3:
                        completion_stats["fully_restored"] += 1
                    elif restored_fields > 0:
                        completion_stats["partially_restored"] += 1
                    else:
                        completion_stats["not_restored"] += 1

                results["steps"]["completion_stats"] = completion_stats

                # Success if at least 50% of books have original fields restored
                success_rate = completion_stats["fully_restored"] / completion_stats["total_books"]
                results["success"] = success_rate >= 0.5

                if results["success"]:
                    logger.info(f"Missing originals completion test PASSED (success rate: {success_rate:.1%})")
                else:
                    logger.warning(f"Missing originals completion test FAILED (success rate: {success_rate:.1%})")

        except Exception as e:
            error_msg = f"Missing originals completion test failed: {str(e)}"
            logger.error(error_msg)
            results["errors"].append(error_msg)
            results["success"] = False

        return results

    def _validate_missing_originals_test(self, modified_books: list, initial_stats: dict,
                                    final_stats: dict, scraping_jobs: int) -> Dict[str, Any]:
        """Validate the missing originals test results"""
        validation = {
            "passed": True,
            "issues": [],
            "metrics": {}
        }

        try:
            # Check if books were actually modified
            books_modified = len(modified_books)
            if books_modified == 0:
                validation["issues"].append("No books were modified during preparation")
                validation["passed"] = False

            # For missing original fields test, we expect scraping jobs to be created
            # Check if scraping jobs were created
            if scraping_jobs == 0:
                validation["issues"].append("No scraping jobs were created")
                validation["passed"] = False

            # Calculate metrics
            validation["metrics"] = {
                "books_modified": books_modified,
                "scraping_jobs_created": scraping_jobs,
                "detection_effectiveness": scraping_jobs / max(books_modified, 1)
            }

            # Overall success criteria
            if len(validation["issues"]) == 0 and scraping_jobs > 0:
                validation["passed"] = True
            else:
                validation["passed"] = False

        except Exception as e:
            validation["issues"].append(f"Validation error: {str(e)}")
            validation["passed"] = False

        return validation

    def run_all_missing_originals_tests(self) -> Dict[str, Any]:
        """Run all missing originals related tests"""
        logger.info("Running all missing originals tests")

        results = {
            "test_suite": "missing_originals",
            "timestamp": time.time(),
            "tests": {},
            "success": False
        }

        # Run detection test
        detection_result = self.test_missing_originals_detection()
        results["tests"]["detection"] = detection_result

        # Run completion test
        completion_result = self.test_missing_originals_completion()
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

    parser = argparse.ArgumentParser(description='Run missing originals tests')
    parser.add_argument('--test', choices=['detection', 'completion', 'all'],
                       default='all', help='Which test to run')
    parser.add_argument('--verbose', action='store_true', help='Verbose logging')

    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(level=log_level, format='%(asctime)s - %(levelname)s - %(message)s')

    tester = MissingOriginalsTest()

    if args.test == 'detection':
        results = tester.test_missing_originals_detection()
    elif args.test == 'completion':
        results = tester.test_missing_originals_completion()
    else:
        results = tester.run_all_missing_originals_tests()

    print(json.dumps(results, indent=2, default=str))

if __name__ == '__main__':
    main()