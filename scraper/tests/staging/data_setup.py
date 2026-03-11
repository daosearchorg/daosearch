"""
Test Data Preparation Module
Deliberately manipulates staging data to create test scenarios
"""

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Any

from core.database import db_manager
from core.models import Book, Chapter

logger = logging.getLogger(__name__)

class TestDataPreparer:
    """Prepares staging database with deliberate issues for testing"""

    def __init__(self):
        self.db = db_manager
        self._test_config = None
        self._num_test_books = None

    def load_test_config(self) -> Dict[str, Any]:
        """Load test book configuration"""
        if self._test_config is None:
            config_path = os.path.join(os.path.dirname(__file__), '..', 'fixtures', 'test_books.json')
            with open(config_path, 'r', encoding='utf-8') as f:
                self._test_config = json.load(f)
        return self._test_config

    @property
    def num_test_books(self) -> int:
        """Get the number of test books from configuration"""
        if self._num_test_books is None:
            config = self.load_test_config()
            self._num_test_books = len(config['test_books'])
            logger.info(f"Auto-detected {self._num_test_books} test books from configuration")
        return self._num_test_books

    def _get_field_assignment(self, book_index: int, field_types: list) -> str:
        """Assign field types to books dynamically based on number of books"""
        return field_types[book_index % len(field_types)]

    def prepare_missing_fields_test(self, limit: int = None) -> Dict[str, Any]:
        """Remove specific translated fields from books to test missing translation detection"""
        if limit is None:
            limit = self.num_test_books
        logger.info(f"Preparing missing translated fields test for {limit} books")

        try:
            with self.db.get_session() as session:
                # Get books that have translations (so we can remove them)
                books = session.query(Book).filter(
                    Book.title_translated.isnot(None)
                ).limit(limit).all()

                modifications = []

                for i, book in enumerate(books):
                    modification = {
                        "book_id": book.id,
                        "book_url": book.url,
                        "removed_fields": []
                    }

                    # Remove different fields for different books dynamically
                    field_types = ["title_translated", "synopsis_translated", "author_translated"]
                    assigned_field = self._get_field_assignment(i, field_types)

                    if assigned_field == "title_translated" and book.title_translated:
                        book.title_translated = None
                        modification["removed_fields"].append("title_translated")
                    elif assigned_field == "synopsis_translated" and book.synopsis_translated:
                        book.synopsis_translated = None
                        modification["removed_fields"].append("synopsis_translated")
                    elif assigned_field == "author_translated" and book.author_translated:
                        book.author_translated = None
                        modification["removed_fields"].append("author_translated")

                    modifications.append(modification)

                logger.info(f"Removed translated fields from {len(modifications)} books")

                return {
                    "type": "missing_translated_fields",
                    "books_modified": len(modifications),
                    "modifications": modifications
                }

        except Exception as e:
            logger.error(f"Error preparing missing translated fields test: {e}")
            raise

    def prepare_missing_original_fields_test(self, limit: int = None) -> Dict[str, Any]:
        """Remove original scraped fields from books to test missing scraped data detection"""
        if limit is None:
            limit = self.num_test_books
        logger.info(f"Preparing missing original fields test for {limit} books")

        try:
            with self.db.get_session() as session:
                # Get books that have original data (so we can remove them)
                books = session.query(Book).filter(
                    Book.title.isnot(None),
                    Book.title != '',
                    Book.author.isnot(None),
                    Book.author != ''
                ).limit(limit).all()

                modifications = []

                for i, book in enumerate(books):
                    modification = {
                        "book_id": book.id,
                        "book_url": book.url,
                        "removed_fields": []
                    }

                    # Remove different original fields for different books dynamically
                    field_types = ["title", "author", "synopsis"]
                    assigned_field = self._get_field_assignment(i, field_types)

                    if assigned_field == "title":
                        book.title = ''
                        modification["removed_fields"].append("title")
                    elif assigned_field == "author":
                        book.author = ''
                        modification["removed_fields"].append("author")
                    elif assigned_field == "synopsis":
                        book.synopsis = ''
                        modification["removed_fields"].append("synopsis")

                    modifications.append(modification)

                logger.info(f"Removed original fields from {len(modifications)} books")

                return {
                    "type": "missing_original_fields",
                    "books_modified": len(modifications),
                    "modifications": modifications
                }

        except Exception as e:
            logger.error(f"Error preparing missing original fields test: {e}")
            raise

    def prepare_missing_translations_test(self, book_limit: int = 2, chapter_limit: int = 10) -> Dict[str, Any]:
        """Clear translations to test missing translations detection"""
        logger.info(f"Preparing missing translations test for {book_limit} books and {chapter_limit} chapters")

        try:
            with self.db.get_session() as session:
                modifications = {
                    "books_cleared": [],
                    "chapters_cleared": []
                }

                # Clear book translations
                books = session.query(Book).filter(
                    Book.title_translated.isnot(None)
                ).limit(book_limit).all()

                for book in books:
                    book_data = {
                        "book_id": book.id,
                        "url": book.url,
                        "cleared_fields": []
                    }

                    if book.title_translated:
                        book.title_translated = None
                        book_data["cleared_fields"].append("title_translated")

                    if book.synopsis_translated:
                        book.synopsis_translated = None
                        book_data["cleared_fields"].append("synopsis_translated")

                    if book.author_translated:
                        book.author_translated = None
                        book_data["cleared_fields"].append("author_translated")

                    modifications["books_cleared"].append(book_data)

                # Clear chapter translations
                chapters = session.query(Chapter).filter(
                    Chapter.title_translated.isnot(None)
                ).limit(chapter_limit).all()

                for chapter in chapters:
                    chapter_data = {
                        "chapter_id": chapter.id,
                        "book_id": chapter.book_id,
                        "title": chapter.title
                    }

                    if chapter.title_translated:
                        chapter.title_translated = None
                        chapter_data["cleared_field"] = "title_translated"

                    modifications["chapters_cleared"].append(chapter_data)

                logger.info(f"Cleared translations for {len(modifications['books_cleared'])} books and {len(modifications['chapters_cleared'])} chapters")

                return {
                    "type": "missing_translations",
                    "books_affected": len(modifications["books_cleared"]),
                    "chapters_affected": len(modifications["chapters_cleared"]),
                    "modifications": modifications
                }

        except Exception as e:
            logger.error(f"Error preparing missing translations test: {e}")
            raise

    def prepare_refresh_test(self, hours_threshold: int = 48, limit: int = None) -> Dict[str, Any]:
        """Set last_scraped_at to make books appear stale"""
        if limit is None:
            limit = self.num_test_books
        logger.info(f"Preparing refresh test for {limit} books with {hours_threshold}h threshold")

        try:
            with self.db.get_session() as session:
                # Get books that were recently scraped
                books = session.query(Book).filter(
                    Book.last_scraped_at.isnot(None)
                ).limit(limit).all()

                modifications = []
                stale_time = datetime.now(timezone.utc) - timedelta(hours=hours_threshold + 24)  # Make them older than threshold

                for book in books:
                    original_time = book.last_scraped_at
                    book.last_scraped_at = stale_time

                    modifications.append({
                        "book_id": book.id,
                        "url": book.url,
                        "original_scraped_at": original_time.isoformat() if original_time else None,
                        "new_scraped_at": stale_time.isoformat(),
                        "hours_old": hours_threshold + 24
                    })

                logger.info(f"Made {len(modifications)} books appear stale")

                return {
                    "type": "refresh_test",
                    "books_modified": len(modifications),
                    "threshold_hours": hours_threshold,
                    "modifications": modifications
                }

        except Exception as e:
            logger.error(f"Error preparing refresh test: {e}")
            raise

    def prepare_partial_chapters_test(self, limit: int = 2) -> Dict[str, Any]:
        """Delete some chapters to simulate partial scraping"""
        logger.info(f"Preparing partial chapters test for {limit} books")

        try:
            with self.db.get_session() as session:
                modifications = []

                # Find books with multiple chapters
                books_with_chapters = session.query(Book).join(Chapter).group_by(Book.id).having(
                    session.query(Chapter).filter(Chapter.book_id == Book.id).count() > 5
                ).limit(limit).all()

                for book in books_with_chapters:
                    chapters = session.query(Chapter).filter(Chapter.book_id == book.id).order_by(Chapter.sequence_number).all()

                    if len(chapters) > 5:
                        # Delete last 3 chapters to simulate partial scraping
                        chapters_to_delete = chapters[-3:]
                        deleted_chapters = []

                        for chapter in chapters_to_delete:
                            deleted_chapters.append({
                                "chapter_id": chapter.id,
                                "sequence_number": chapter.sequence_number,
                                "title": chapter.title
                            })
                            session.delete(chapter)

                        modifications.append({
                            "book_id": book.id,
                            "url": book.url,
                            "deleted_chapters": deleted_chapters,
                            "remaining_chapters": len(chapters) - len(chapters_to_delete)
                        })

                logger.info(f"Deleted chapters from {len(modifications)} books")

                return {
                    "type": "partial_chapters",
                    "books_modified": len(modifications),
                    "modifications": modifications
                }

        except Exception as e:
            logger.error(f"Error preparing partial chapters test: {e}")
            raise

    def prepare_all_test_scenarios(self) -> Dict[str, Any]:
        """Prepare all test scenarios"""
        logger.info("Preparing all test scenarios")

        results = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "scenarios": {}
        }

        try:
            # Prepare each test scenario
            results["scenarios"]["missing_fields"] = self.prepare_missing_fields_test(3)
            results["scenarios"]["missing_translations"] = self.prepare_missing_translations_test(2, 10)
            results["scenarios"]["refresh_test"] = self.prepare_refresh_test(48, 3)
            results["scenarios"]["partial_chapters"] = self.prepare_partial_chapters_test(2)

            logger.info("All test scenarios prepared successfully")
            return results

        except Exception as e:
            logger.error(f"Error preparing test scenarios: {e}")
            raise

    def get_database_stats(self) -> Dict[str, Any]:
        """Get current database statistics"""
        with self.db.get_session() as session:
            stats = {
                "books": {
                    "total": session.query(Book).count(),
                    "with_translations": session.query(Book).filter(Book.title_translated.isnot(None)).count(),
                    "missing_title_translated": session.query(Book).filter(Book.title_translated.is_(None)).count(),
                    "missing_synopsis_translated": session.query(Book).filter(Book.synopsis_translated.is_(None)).count(),
                    "recently_scraped": session.query(Book).filter(
                        Book.last_scraped_at > datetime.now(timezone.utc) - timedelta(hours=24)
                    ).count()
                },
                "chapters": {
                    "total": session.query(Chapter).count(),
                    "with_translations": session.query(Chapter).filter(Chapter.title_translated.isnot(None)).count(),
                    "missing_translations": session.query(Chapter).filter(Chapter.title_translated.is_(None)).count()
                }
            }

            return stats

def main():
    """Main function for CLI usage"""
    import argparse

    parser = argparse.ArgumentParser(description='Prepare staging test data')
    parser.add_argument('--scenario', choices=['missing_fields', 'missing_translations', 'refresh', 'partial_chapters', 'all'],
                       default='all', help='Test scenario to prepare')
    parser.add_argument('--stats', action='store_true', help='Show database statistics')

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    preparer = TestDataPreparer()

    if args.stats:
        stats = preparer.get_database_stats()
        print(json.dumps(stats, indent=2))
        return

    if args.scenario == 'all':
        results = preparer.prepare_all_test_scenarios()
    elif args.scenario == 'missing_fields':
        results = preparer.prepare_missing_fields_test()
    elif args.scenario == 'missing_translations':
        results = preparer.prepare_missing_translations_test()
    elif args.scenario == 'refresh':
        results = preparer.prepare_refresh_test()
    elif args.scenario == 'partial_chapters':
        results = preparer.prepare_partial_chapters_test()

    print(json.dumps(results, indent=2))

if __name__ == '__main__':
    main()