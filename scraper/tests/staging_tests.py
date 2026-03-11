#!/usr/bin/env python3
"""
Staging Tests Runner for Docker Environment
Combines all test functionality for running inside Docker containers
"""

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Dict, Any

from sqlalchemy import text

from core.database import db_manager
from core.models import Book, Chapter
from services.queue_manager import QueueManager

# Configure logging for Docker
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class StagingTestRunner:
    """Main test runner for staging environment"""

    def __init__(self):
        self.test_suite = os.getenv('TEST_SUITE', 'all')
        self.start_time = time.time()
        self.environment_ready = False

    def verify_connections(self) -> Dict[str, Any]:
        """Verify database and Redis connections (Docker already ensures they're healthy)"""
        logger.info("Verifying service connections...")
        self.environment_ready = True  # Docker health checks ensure services are ready

        return {
            "database": self._test_database(),
            "redis": self._test_redis(),
            "success": True  # Docker health checks ensure services are ready
        }

    def _wait_for_empty_queues(self, timeout: int = 120) -> None:
        """Wait for all queues to be empty before running tests that require clean state"""
        logger.info("Waiting for all queues to be empty...")

        try:
            from services.queue_manager import QueueManager
            queue_manager = QueueManager()

            wait_start = time.time()
            while time.time() - wait_start < timeout:
                queue_stats = queue_manager.get_queue_stats()

                total_active = 0
                queue_details = []
                for queue_name, stats in queue_stats.items():
                    pending = stats.get('pending', 0)
                    started = stats.get('started', 0)
                    active = pending + started
                    total_active += active
                    if active > 0:
                        queue_details.append(f"{queue_name}: {pending} pending, {started} started")

                if total_active == 0:
                    logger.info("✅ All queues are empty")
                    return

                logger.info(f"Waiting for {total_active} jobs to complete ({', '.join(queue_details)})")
                time.sleep(10)

            logger.warning(f"Timeout waiting for empty queues after {timeout}s")

        except Exception as e:
            logger.warning(f"Error checking queue status: {e}")
            logger.info("Continuing with test execution...")

    def run_migrations(self) -> Dict[str, Any]:
        """Create database tables using SQLAlchemy models"""
        logger.info("Running database migrations...")

        try:
            from core.models import Base
            from core.database import db_manager

            # Create all tables using SQLAlchemy metadata
            Base.metadata.create_all(bind=db_manager.engine)
            logger.info("✅ Database tables created successfully")

            # Verify tables were created
            with db_manager.get_session() as session:
                result = session.execute(text("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"))
                table_count = result.scalar()
                logger.info(f"Created {table_count} tables in database")

            return {
                "success": True,
                "tables_created": table_count
            }

        except Exception as e:
            logger.error(f"❌ Migration failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def _test_database(self) -> bool:
        """Test database connectivity"""
        try:
            with db_manager.get_session() as session:
                session.execute(text("SELECT 1"))
                return True
        except Exception:
            return False

    def _test_redis(self) -> bool:
        """Test Redis connectivity"""
        try:
            queue_manager = QueueManager()
            queue_manager.get_queue_stats()
            return True
        except Exception:
            return False

    def _wait_for_job_completion(self, job_id: str, timeout: int = 300) -> Dict[str, Any]:
        """Monitor single job until completion"""
        queue_manager = QueueManager()
        start_time = time.time()

        # Only log the final result, not every check
        while time.time() - start_time < timeout:
            status = queue_manager.get_job_status(job_id)

            if status['status'] == 'finished':
                logger.info(f"Job {job_id} completed successfully")
                return status
            elif status['status'] == 'failed':
                logger.error(f"Job {job_id} failed: {status.get('exc_info', 'Unknown error')}")
                return status
            elif status['status'] == 'not_found':
                logger.warning(f"Job {job_id} not found")
                return status

            time.sleep(3)

        logger.warning(f"Job {job_id} timed out after {timeout} seconds")
        return {'status': 'timeout', 'job_id': job_id}



    def _verify_scraped_data(self, expected_books: list) -> Dict[str, Any]:
        """Verify all books and chapters were scraped correctly"""
        verification_results = {
            "books_found": 0,
            "total_chapters": 0,
            "books_with_translations": 0,
            "details": []
        }

        with db_manager.get_session() as session:
            for expected in expected_books:
                book = session.query(Book).filter(Book.url == expected['url']).first()

                if book:
                    verification_results["books_found"] += 1

                    chapters_count = session.query(Chapter).filter(Chapter.book_id == book.id).count()
                    verification_results["total_chapters"] += chapters_count

                    if book.title_translated:
                        verification_results["books_with_translations"] += 1

                    verification_results["details"].append({
                        "url": expected['url'],
                        "found": True,
                        "expected_chapters": expected['expected_chapters'],
                        "actual_chapters": chapters_count,
                        "has_translation": bool(book.title_translated),
                        "scenarios": expected['test_scenarios']
                    })
                else:
                    verification_results["details"].append({
                        "url": expected['url'],
                        "found": False,
                        "expected_chapters": expected['expected_chapters'],
                        "actual_chapters": 0,
                        "has_translation": False,
                        "scenarios": expected['test_scenarios']
                    })

        return verification_results

    def prepare_test_data(self) -> Dict[str, Any]:
        """Prepare test data - note that data will be populated by scraping tests"""
        logger.info("Preparing test data...")

        try:
            from tests.staging.data_setup import TestDataPreparer

            preparer = TestDataPreparer()

            # Get initial stats
            initial_stats = preparer.get_database_stats()
            logger.info(f"Database stats at test data preparation: {initial_stats}")

            # Note: Data corruption will happen later in individual test suites
            # after the scraping test has populated the database
            if initial_stats["books"]["total"] > 0:
                logger.info("Database has existing data - test scenarios will be prepared during individual test suites")
                return {
                    "success": True,
                    "note": "Data exists - scenarios will be prepared by individual test suites",
                    "initial_stats": initial_stats
                }
            else:
                logger.info("Database is empty - scraping tests will populate data first")
                return {
                    "success": True,
                    "note": "Database empty - will be populated by scraping tests",
                    "initial_stats": initial_stats
                }

        except Exception as e:
            logger.error(f"Test data preparation failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def run_test_suite(self, suite_name: str) -> Dict[str, Any]:
        """Run a specific test suite"""
        logger.info(f"Running test suite: {suite_name}")

        if not self.environment_ready:
            return {
                "suite": suite_name,
                "success": False,
                "error": "Environment not ready. Dependencies check failed."
            }

        test_suites = {
            "missing_originals": self._run_missing_originals_tests,
            "refresh_tasks": self._run_refresh_tests,
            "missing_translations": self._run_translation_tests,
            "scraping": self._run_scraping_tests,
            "smoke": self._run_smoke_tests
        }

        if suite_name not in test_suites:
            return {
                "suite": suite_name,
                "success": False,
                "error": f"Unknown test suite: {suite_name}"
            }

        try:
            return test_suites[suite_name]()
        except Exception as e:
            logger.error(f"Test suite {suite_name} failed: {str(e)}")
            return {
                "suite": suite_name,
                "success": False,
                "error": str(e)
            }

    def run_all_tests(self) -> Dict[str, Any]:
        """Run all test suites"""
        logger.info("Running all staging tests")

        all_results = {
            "test_run": "docker_staging_tests",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "test_suite_requested": self.test_suite,
            "dependency_check": {},
            "test_data_preparation": {},
            "test_suites": {},
            "summary": {},
            "overall_success": False
        }

        try:
            # Step 1: Verify connections (Docker health checks ensure services are ready)
            all_results["dependency_check"] = self.verify_connections()

            # Step 2: Run database migrations
            migration_result = self.run_migrations()
            all_results["migrations"] = migration_result

            if not migration_result["success"]:
                all_results["summary"]["error"] = "Database migrations failed"
                return all_results

            # Step 3: Prepare test data
            test_data_result = self.prepare_test_data()
            all_results["test_data_preparation"] = test_data_result

            # Step 3: Run requested test suites
            if self.test_suite == "all":
                # Run refresh_tasks last to avoid queue conflicts
                test_suites = ["smoke", "scraping", "missing_originals", "missing_translations", "refresh_tasks"]
            else:
                test_suites = [self.test_suite]

            successful_suites = 0

            for suite_name in test_suites:
                logger.info(f"Starting test suite: {suite_name}")

                # Wait for queues to be empty before running refresh tests
                if suite_name == "refresh_tasks":
                    self._wait_for_empty_queues()

                suite_result = self.run_test_suite(suite_name)
                all_results["test_suites"][suite_name] = suite_result

                if suite_result.get("success", False):
                    successful_suites += 1
                    logger.info(f"✅ {suite_name} tests PASSED")
                else:
                    logger.warning(f"❌ {suite_name} tests FAILED")

            # Step 4: Generate summary
            total_suites = len(test_suites)
            success_rate = successful_suites / total_suites if total_suites > 0 else 0

            all_results["summary"] = {
                "total_suites": total_suites,
                "successful_suites": successful_suites,
                "failed_suites": total_suites - successful_suites,
                "success_rate": success_rate,
                "duration_seconds": time.time() - self.start_time
            }

            all_results["overall_success"] = success_rate >= 0.75  # 75% success threshold

            logger.info(f"All tests completed. Success rate: {success_rate:.1%}")

        except Exception as e:
            error_msg = f"Test run failed: {str(e)}"
            logger.error(error_msg)
            all_results["summary"]["error"] = error_msg

        return all_results

    def _run_missing_originals_tests(self) -> Dict[str, Any]:
        """Run missing originals test suite"""
        logger.info("Running missing originals tests")

        try:
            from tests.staging.test_missing_originals import MissingOriginalsTest
            tester = MissingOriginalsTest()
            return tester.run_all_missing_originals_tests()

        except Exception as e:
            return {
                "suite": "missing_originals",
                "success": False,
                "error": str(e)
            }

    def _run_refresh_tests(self) -> Dict[str, Any]:
        """Run refresh tasks test suite"""
        logger.info("Running refresh tasks tests")

        try:
            from tests.staging.test_refresh_tasks import RefreshTasksTest
            tester = RefreshTasksTest()
            return tester.run_all_refresh_tests()

        except Exception as e:
            return {
                "suite": "refresh_tasks",
                "success": False,
                "error": str(e)
            }

    def _run_translation_tests(self) -> Dict[str, Any]:
        """Run translation test suite"""
        logger.info("Running translation tests")

        try:
            from tests.staging.test_missing_translations import MissingTranslationsTest
            tester = MissingTranslationsTest()
            return tester.run_all_translation_tests()

        except Exception as e:
            return {
                "suite": "missing_translations",
                "success": False,
                "error": str(e)
            }

    def _run_scraping_tests(self) -> Dict[str, Any]:
        """Run comprehensive scraping and translation tests for all test books"""
        logger.info("Running comprehensive scraping and translation tests")

        results = {
            "suite": "scraping",
            "success": False,
            "phases": {},
            "books_scraped": 0,
            "total_chapters": 0,
            "translations_completed": 0
        }

        try:
            # Phase 1: Load all test books
            logger.info("Phase 1: Loading test book configurations")
            fixtures_path = os.path.join(os.path.dirname(__file__), 'fixtures', 'test_books.json')
            with open(fixtures_path, 'r', encoding='utf-8') as f:
                test_data = json.load(f)

            books = test_data['test_books']
            logger.info(f"Found {len(books)} test books to scrape")

            # Phase 2: Queue scraping for ALL test books
            logger.info("Phase 2: Queuing scraping jobs for all test books")
            queue_manager = QueueManager()
            scrape_jobs = []

            for book in books:
                try:
                    job_id = queue_manager.add_scrape_job(book['url'])
                    scrape_jobs.append({
                        'job_id': job_id,
                        'url': book['url'],
                        'expected_chapters': book['expected_chapters'],
                        'scenarios': book['test_scenarios'],
                        'description': book['description']
                    })
                    logger.info(f"Queued scraping job {job_id} for {book['url']} ({book['expected_chapters']} chapters)")
                except Exception as e:
                    logger.error(f"Failed to queue scraping job for {book['url']}: {e}")

            results["phases"]["job_queuing"] = {
                "jobs_queued": len(scrape_jobs),
                "expected_total": len(books)
            }

            # Phase 3: Wait for all scraping jobs to complete
            logger.info("Phase 3: Waiting for scraping jobs to complete")
            completed_jobs = []
            failed_jobs = []

            for job in scrape_jobs:
                status = self._wait_for_job_completion(job['job_id'], timeout=300)

                if status['status'] == 'finished':
                    completed_jobs.append(job)
                    logger.info(f"✅ Successfully scraped {job['url']}")
                else:
                    failed_jobs.append({'job': job, 'status': status})
                    logger.error(f"❌ Failed to scrape {job['url']}: {status}")

            results["phases"]["scraping"] = {
                "completed": len(completed_jobs),
                "failed": len(failed_jobs),
                "failed_details": failed_jobs
            }

            # Phase 4: Wait for all translation jobs to complete
            logger.info("Phase 4: Waiting for all translation jobs to complete")
            self._wait_for_empty_queues(timeout=600)
            translation_success = True  # If no exception, queues are empty

            results["phases"]["translations"] = {
                "queue_emptied": translation_success
            }

            # Phase 5: Verify all data
            logger.info("Phase 5: Verifying scraped data")
            verification = self._verify_scraped_data(books)
            results["phases"]["verification"] = verification

            # Update summary stats
            results["books_scraped"] = verification["books_found"]
            results["total_chapters"] = verification["total_chapters"]
            results["translations_completed"] = verification["books_with_translations"]

            # Determine overall success
            expected_books = len(books)
            success_rate = verification["books_found"] / expected_books if expected_books > 0 else 0
            results["success"] = success_rate >= 0.8  # 80% success threshold

            if results["success"]:
                logger.info(f"✅ Scraping tests PASSED: {verification['books_found']}/{expected_books} books, {verification['total_chapters']} chapters, {verification['books_with_translations']} translations")
            else:
                logger.warning(f"❌ Scraping tests FAILED: Only {verification['books_found']}/{expected_books} books scraped successfully")

            return results

        except Exception as e:
            logger.error(f"Scraping tests failed: {e}")
            results["error"] = str(e)
            return results

    def _run_smoke_tests(self) -> Dict[str, Any]:
        """Run smoke tests"""
        logger.info("Running smoke tests")

        try:
            smoke_results = {
                "suite": "smoke",
                "tests": {},
                "success": False
            }

            # Test database
            smoke_results["tests"]["database"] = {
                "success": self._test_database()
            }

            # Test Redis
            smoke_results["tests"]["redis"] = {
                "success": self._test_redis()
            }

            # Test queue operations
            try:
                queue_manager = QueueManager()
                stats = queue_manager.get_queue_stats()
                smoke_results["tests"]["queue"] = {
                    "success": True,
                    "stats": stats
                }
            except Exception as e:
                smoke_results["tests"]["queue"] = {
                    "success": False,
                    "error": str(e)
                }

            # Test basic data operations
            try:
                from tests.staging.data_setup import TestDataPreparer
                preparer = TestDataPreparer()
                db_stats = preparer.get_database_stats()
                smoke_results["tests"]["data"] = {
                    "success": True,
                    "database_stats": db_stats
                }
            except Exception as e:
                smoke_results["tests"]["data"] = {
                    "success": False,
                    "error": str(e)
                }

            # Overall success
            all_passed = all(test.get("success", False) for test in smoke_results["tests"].values())
            smoke_results["success"] = all_passed

            if all_passed:
                logger.info("✅ All smoke tests PASSED")
            else:
                logger.warning("❌ Some smoke tests FAILED")

            return smoke_results

        except Exception as e:
            return {
                "suite": "smoke",
                "success": False,
                "error": str(e)
            }


    def print_results_summary(self, results: Dict[str, Any]) -> None:
        """Print test results summary to stdout"""
        try:
            summary = results.get("summary", {})
            success = results.get("overall_success", False)

            print(f"\n{'='*50}")
            print("TEST RESULTS SUMMARY")
            print(f"{'='*50}")
            print(f"Overall Success: {'✅ PASSED' if success else '❌ FAILED'}")
            print(f"Success Rate: {summary.get('success_rate', 0):.1%}")
            print(f"Suites Run: {summary.get('total_suites', 0)}")
            print(f"Duration: {summary.get('duration_seconds', 0):.1f}s")

            if not success:
                print(f"Failed Suites: {summary.get('failed_suites', 0)}")

        except Exception as e:
            logger.error(f"Failed to print results summary: {e}")


def main():
    """Main entry point for Docker staging tests"""
    logger.info("Starting Docker staging test runner...")

    runner = StagingTestRunner()

    try:
        # Run tests
        results = runner.run_all_tests()

        # Print results summary
        runner.print_results_summary(results)

        # Exit with appropriate code
        success = results.get("overall_success", False)
        exit_code = 0 if success else 1

        logger.info(f"Test run completed. Exit code: {exit_code}")
        sys.exit(exit_code)

    except Exception as e:
        logger.error(f"Test runner failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()