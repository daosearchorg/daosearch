"""
Missing Translations Detection Tests
Tests the system's ability to detect and translate missing content
"""

import json
import logging
import time
from typing import Dict, Any

from core.database import db_manager
from core.models import Book, Chapter
from services.queue_manager import QueueManager
from workers.maintenance import check_missing_translations
from .data_setup import TestDataPreparer

logger = logging.getLogger(__name__)

class MissingTranslationsTest:
    """Test missing translations detection and completion"""

    def __init__(self):
        self.db = db_manager
        self.queue_manager = QueueManager()
        self.preparer = TestDataPreparer()

    def test_missing_translations_detection(self) -> Dict[str, Any]:
        """Test detection of missing translations for books and chapters"""
        logger.info("Starting missing translations detection test")

        results = {
            "test_name": "missing_translations_detection",
            "timestamp": time.time(),
            "steps": {},
            "success": False,
            "errors": []
        }

        try:
            # Step 1: Get initial database state
            initial_stats = self.preparer.get_database_stats()
            results["steps"]["initial_stats"] = initial_stats
            logger.info(f"Initial database stats: {initial_stats}")

            # Step 2: Prepare test data (clear translations)
            logger.info("Preparing test data by clearing translations")
            preparation_result = self.preparer.prepare_missing_translations_test(
                book_limit=2,
                chapter_limit=10
            )
            results["steps"]["data_preparation"] = preparation_result

            books_affected = preparation_result["books_affected"]
            chapters_affected = preparation_result["chapters_affected"]

            if books_affected == 0 and chapters_affected == 0:
                raise Exception("No translations were cleared during preparation")

            # Step 3: Run missing translations detection
            logger.info("Running missing translations detection maintenance task")
            detection_result = check_missing_translations(limit=100)
            results["steps"]["detection_result"] = detection_result

            # Step 4: Verify translation jobs were created
            logger.info("Checking if translation jobs were created")
            queue_stats = self.queue_manager.get_queue_stats()
            results["steps"]["queue_stats_after_detection"] = queue_stats

            translation_jobs = queue_stats.get("translation", {}).get("pending", 0)
            if translation_jobs == 0:
                results["errors"].append("No translation jobs were created despite missing translations")

            # Step 5: Get updated database state
            updated_stats = self.preparer.get_database_stats()
            results["steps"]["updated_stats"] = updated_stats

            # Step 6: Validate detection effectiveness
            validation_result = self._validate_translation_detection(
                preparation_result, initial_stats, updated_stats, translation_jobs
            )
            results["steps"]["validation"] = validation_result

            results["success"] = validation_result["passed"] and len(results["errors"]) == 0

            if results["success"]:
                logger.info("Missing translations detection test PASSED")
            else:
                logger.warning(f"Missing translations detection test FAILED: {results['errors']}")

        except Exception as e:
            error_msg = f"Missing translations detection test failed: {str(e)}"
            logger.error(error_msg)
            results["errors"].append(error_msg)
            results["success"] = False

        return results

    def test_translation_completion(self) -> Dict[str, Any]:
        """Test completion of translation jobs (if workers are running)"""
        logger.info("Starting translation completion test")

        results = {
            "test_name": "translation_completion",
            "timestamp": time.time(),
            "steps": {},
            "success": False,
            "errors": []
        }

        try:
            # Step 1: Prepare test data
            preparation_result = self.preparer.prepare_missing_translations_test(
                book_limit=2,
                chapter_limit=5
            )
            results["steps"]["data_preparation"] = preparation_result

            book_ids = [book["book_id"] for book in preparation_result["modifications"]["books_cleared"]]
            chapter_ids = [chapter["chapter_id"] for chapter in preparation_result["modifications"]["chapters_cleared"]]

            # Step 2: Run detection to queue translation jobs
            detection_result = check_missing_translations(limit=50)
            results["steps"]["detection_result"] = detection_result

            # Step 3: Wait for workers to process translation jobs
            logger.info("Waiting for workers to process translation jobs...")
            max_wait_time = 120  # seconds (translations take longer)
            wait_time = 0
            check_interval = 15

            translation_stats = {
                "books_translated": 0,
                "chapters_translated": 0,
                "total_books": len(book_ids),
                "total_chapters": len(chapter_ids),
                "translation_progress": []
            }

            while wait_time < max_wait_time:
                time.sleep(check_interval)
                wait_time += check_interval

                # Check translation progress
                progress = self._check_translation_progress(book_ids, chapter_ids)
                translation_stats.update(progress)

                books_rate = progress["books_translated"] / len(book_ids) if book_ids else 1
                chapters_rate = progress["chapters_translated"] / len(chapter_ids) if chapter_ids else 1

                logger.info(f"Translation progress after {wait_time}s: Books {books_rate:.1%}, Chapters {chapters_rate:.1%}")

                # Success threshold: 60% completion
                if books_rate >= 0.6 and chapters_rate >= 0.6:
                    logger.info("Sufficient translations completed")
                    break

            results["steps"]["translation_stats"] = translation_stats

            # Step 4: Final validation
            validation_result = self._validate_translation_completion(translation_stats)
            results["steps"]["validation"] = validation_result

            results["success"] = validation_result["passed"]

            if results["success"]:
                logger.info("Translation completion test PASSED")
            else:
                logger.warning(f"Translation completion test FAILED: {validation_result['issues']}")

        except Exception as e:
            error_msg = f"Translation completion test failed: {str(e)}"
            logger.error(error_msg)
            results["errors"].append(error_msg)
            results["success"] = False

        return results

    def test_batch_translation_efficiency(self) -> Dict[str, Any]:
        """Test that translations are processed in efficient batches"""
        logger.info("Starting batch translation efficiency test")

        results = {
            "test_name": "batch_translation_efficiency",
            "timestamp": time.time(),
            "steps": {},
            "success": False,
            "errors": []
        }

        try:
            # Step 1: Prepare larger dataset for batch testing
            preparation_result = self.preparer.prepare_missing_translations_test(
                book_limit=self.preparer.num_test_books,
                chapter_limit=30  # Should trigger batch processing
            )
            results["steps"]["data_preparation"] = preparation_result

            # Step 2: Record initial queue state
            initial_queue_stats = self.queue_manager.get_queue_stats()
            results["steps"]["initial_queue_stats"] = initial_queue_stats

            # Step 3: Run detection
            detection_result = check_missing_translations(limit=100)
            results["steps"]["detection_result"] = detection_result

            # Step 4: Analyze queue state after detection
            final_queue_stats = self.queue_manager.get_queue_stats()
            results["steps"]["final_queue_stats"] = final_queue_stats

            # Step 5: Validate batch efficiency
            validation_result = self._validate_batch_efficiency(
                preparation_result, initial_queue_stats, final_queue_stats
            )
            results["steps"]["validation"] = validation_result

            results["success"] = validation_result["passed"]

            if results["success"]:
                logger.info("Batch translation efficiency test PASSED")
            else:
                logger.warning(f"Batch translation efficiency test FAILED: {validation_result['issues']}")

        except Exception as e:
            error_msg = f"Batch translation efficiency test failed: {str(e)}"
            logger.error(error_msg)
            results["errors"].append(error_msg)
            results["success"] = False

        return results

    def _check_translation_progress(self, book_ids: list, chapter_ids: list) -> Dict[str, Any]:
        """Check current translation progress for tracked items"""
        with self.db.get_session() as session:
            progress = {
                "books_translated": 0,
                "chapters_translated": 0,
                "book_details": [],
                "chapter_details": []
            }

            # Check book translations
            if book_ids:
                books = session.query(Book).filter(Book.id.in_(book_ids)).all()
                for book in books:
                    translated_fields = sum([
                        bool(book.title_translated),
                        bool(book.synopsis_translated),
                        bool(book.author_translated)
                    ])

                    is_translated = translated_fields >= 2  # At least 2 fields translated
                    if is_translated:
                        progress["books_translated"] += 1

                    progress["book_details"].append({
                        "book_id": book.id,
                        "translated_fields": translated_fields,
                        "is_translated": is_translated
                    })

            # Check chapter translations
            if chapter_ids:
                chapters = session.query(Chapter).filter(Chapter.id.in_(chapter_ids)).all()
                for chapter in chapters:
                    is_translated = bool(chapter.title_translated)
                    if is_translated:
                        progress["chapters_translated"] += 1

                    progress["chapter_details"].append({
                        "chapter_id": chapter.id,
                        "is_translated": is_translated
                    })

            return progress

    def _validate_translation_detection(self, preparation_result: dict, initial_stats: dict,
                                      updated_stats: dict, translation_jobs: int) -> Dict[str, Any]:
        """Validate the translation detection results"""
        validation = {
            "passed": True,
            "issues": [],
            "metrics": {}
        }

        try:
            books_affected = preparation_result["books_affected"]
            chapters_affected = preparation_result["chapters_affected"]

            # Check if items were actually affected
            if books_affected == 0 and chapters_affected == 0:
                validation["issues"].append("No books or chapters were affected during preparation")
                validation["passed"] = False

            # Check if translation jobs were created
            if translation_jobs == 0:
                validation["issues"].append("No translation jobs were created")
                validation["passed"] = False

            # Check if missing translation counts increased
            initial_missing_books = initial_stats["books"]["missing_title_translated"]
            updated_missing_books = updated_stats["books"]["missing_title_translated"]

            initial_missing_chapters = initial_stats["chapters"]["missing_translations"]
            updated_missing_chapters = updated_stats["chapters"]["missing_translations"]

            if updated_missing_books <= initial_missing_books and updated_missing_chapters <= initial_missing_chapters:
                validation["issues"].append("Missing translation counts didn't increase as expected")

            # Calculate metrics
            validation["metrics"] = {
                "books_affected": books_affected,
                "chapters_affected": chapters_affected,
                "translation_jobs_created": translation_jobs,
                "missing_books_increase": updated_missing_books - initial_missing_books,
                "missing_chapters_increase": updated_missing_chapters - initial_missing_chapters,
                "detection_effectiveness": translation_jobs / max(books_affected + chapters_affected, 1)
            }

            # Success criteria
            if len(validation["issues"]) == 0 and translation_jobs > 0:
                validation["passed"] = True
            else:
                validation["passed"] = False

        except Exception as e:
            validation["issues"].append(f"Validation error: {str(e)}")
            validation["passed"] = False

        return validation

    def _validate_translation_completion(self, translation_stats: dict) -> Dict[str, Any]:
        """Validate translation completion results"""
        validation = {
            "passed": True,
            "issues": [],
            "metrics": translation_stats
        }

        try:
            total_books = translation_stats["total_books"]
            total_chapters = translation_stats["total_chapters"]
            books_translated = translation_stats["books_translated"]
            chapters_translated = translation_stats["chapters_translated"]

            # Calculate completion rates
            book_completion_rate = books_translated / total_books if total_books > 0 else 1
            chapter_completion_rate = chapters_translated / total_chapters if total_chapters > 0 else 1

            # Success thresholds
            if book_completion_rate < 0.5:  # 50% minimum for books
                validation["issues"].append(f"Low book completion rate: {book_completion_rate:.1%}")
                validation["passed"] = False

            if chapter_completion_rate < 0.4:  # 40% minimum for chapters
                validation["issues"].append(f"Low chapter completion rate: {chapter_completion_rate:.1%}")
                validation["passed"] = False

            validation["metrics"]["book_completion_rate"] = book_completion_rate
            validation["metrics"]["chapter_completion_rate"] = chapter_completion_rate

        except Exception as e:
            validation["issues"].append(f"Validation error: {str(e)}")
            validation["passed"] = False

        return validation

    def _validate_batch_efficiency(self, preparation_result: dict, initial_queue: dict,
                                  final_queue: dict) -> Dict[str, Any]:
        """Validate batch processing efficiency"""
        validation = {
            "passed": True,
            "issues": [],
            "metrics": {}
        }

        try:
            chapters_affected = preparation_result["chapters_affected"]
            initial_jobs = initial_queue.get("translation", {}).get("pending", 0)
            final_jobs = final_queue.get("translation", {}).get("pending", 0)

            jobs_created = final_jobs - initial_jobs

            # Calculate efficiency metrics
            if chapters_affected > 0:
                jobs_per_chapter = jobs_created / chapters_affected
                batch_efficiency = chapters_affected / max(jobs_created, 1)

                validation["metrics"] = {
                    "chapters_affected": chapters_affected,
                    "jobs_created": jobs_created,
                    "jobs_per_chapter": jobs_per_chapter,
                    "batch_efficiency": batch_efficiency
                }

                # Efficiency criteria: fewer jobs than chapters (indicates batching)
                if jobs_per_chapter > 0.8:  # More than 80% suggests poor batching
                    validation["issues"].append(f"Poor batching efficiency: {jobs_per_chapter:.2f} jobs per chapter")

                if jobs_created == 0:
                    validation["issues"].append("No jobs were created")
                    validation["passed"] = False

            else:
                validation["issues"].append("No chapters affected, cannot test batch efficiency")
                validation["passed"] = False

            if len(validation["issues"]) > 0:
                validation["passed"] = False

        except Exception as e:
            validation["issues"].append(f"Validation error: {str(e)}")
            validation["passed"] = False

        return validation

    def run_all_translation_tests(self) -> Dict[str, Any]:
        """Run all translation-related tests"""
        logger.info("Running all translation tests")

        results = {
            "test_suite": "missing_translations",
            "timestamp": time.time(),
            "tests": {},
            "success": False
        }

        # Run detection test
        detection_result = self.test_missing_translations_detection()
        results["tests"]["detection"] = detection_result

        # Run completion test
        completion_result = self.test_translation_completion()
        results["tests"]["completion"] = completion_result

        # Run batch efficiency test
        efficiency_result = self.test_batch_translation_efficiency()
        results["tests"]["batch_efficiency"] = efficiency_result

        # Overall success
        results["success"] = (
            detection_result["success"] and
            completion_result["success"] and
            efficiency_result["success"]
        )

        return results

def main():
    """Main function for CLI usage"""
    import argparse

    parser = argparse.ArgumentParser(description='Run missing translations tests')
    parser.add_argument('--test', choices=['detection', 'completion', 'efficiency', 'all'],
                       default='all', help='Which test to run')
    parser.add_argument('--verbose', action='store_true', help='Verbose logging')

    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(level=log_level, format='%(asctime)s - %(levelname)s - %(message)s')

    tester = MissingTranslationsTest()

    if args.test == 'detection':
        results = tester.test_missing_translations_detection()
    elif args.test == 'completion':
        results = tester.test_translation_completion()
    elif args.test == 'efficiency':
        results = tester.test_batch_translation_efficiency()
    else:
        results = tester.run_all_translation_tests()

    print(json.dumps(results, indent=2, default=str))

if __name__ == '__main__':
    main()