"""
Translator Worker - Handles translation via Google Translate
"""

import logging
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import update

from core.config import config
from core.database import db_manager
from core.models import Book, Chapter, BookComment, QQUser
from services.google_translate import GoogleTranslateClient
from services.openai_client import OpenAIClient

logger = logging.getLogger(__name__)

# Single-pass translation table for 1:1 Chinese→English punctuation
_PUNCT_TABLE = str.maketrans({
    '\u3002': '.',      # 。 -> .
    '\uff0c': ',',      # ， -> ,
    '\uff1f': '?',      # ？ -> ?
    '\uff01': '!',      # ！ -> !
    '\uff1a': ':',      # ： -> :
    '\uff1b': ';',      # ； -> ;
    '\u201c': '"',      # " -> "
    '\u201d': '"',      # " -> "
    '\u2018': "'",      # ' -> '
    '\u2019': "'",      # ' -> '
    '\u3010': '[',      # 【 -> [
    '\u3011': ']',      # 】 -> ]
    '\uff08': '(',      # （ -> (
    '\uff09': ')',      # ） -> )
    '\u2014': '-',      # — -> -
    '\u3001': ',',      # 、 -> ,
})

def postprocess_translation(text: str) -> str:
    """
    Postprocess translated text to ensure Chinese punctuation is converted to English.
    LLM translations are not always consistent, so we enforce it here.
    """
    if not text:
        return text

    # Single-pass for all 1:1 replacements
    text = text.translate(_PUNCT_TABLE)
    # Multi-char replacements that str.translate can't handle
    text = text.replace('\u300a', '<<')   # 《 -> <<
    text = text.replace('\u300b', '>>')   # 》 -> >>
    text = text.replace('\u2026', '...')  # … -> ...

    return text

class TranslationWorker:
    """Worker for handling book and chapter translations"""

    def __init__(self):
        self.client = GoogleTranslateClient()

    def _get_book_with_validation(self, book_id: int) -> Optional[Book]:
        """Get book and validate it needs translation"""
        with db_manager.get_session() as session:
            book = session.query(Book).filter(Book.id == book_id).first()

            if not book:
                logger.error(f"Book not found: {book_id}")
                return None

            # Check if book needs translation
            needs_translation = any([
                not book.title_translated,
                not book.author_translated,
                not book.synopsis_translated
            ])

            if not needs_translation:
                logger.info(f"Book {book_id} already fully translated")
                return None

            return book


    def _validate_fields_for_translation(self, book: Book, session) -> Dict[str, str]:
        """
        Extract and validate fields that need translation
        Returns dict of fields to translate
        """
        fields_to_translate = {}

        # Check if original fields have content and need translation
        if book.title and not book.title_translated:
            fields_to_translate['title'] = book.title

        if book.author and not book.author_translated:
            fields_to_translate['author'] = book.author

        if book.synopsis and not book.synopsis_translated:
            fields_to_translate['synopsis'] = book.synopsis

        # Handle genre through relationship (skip if already translated)
        if book.genre and book.genre.name and not book.genre.name_translated:
            fields_to_translate['genre'] = book.genre.name

        if book.subgenre and book.subgenre.name and not book.subgenre.name_translated:
            fields_to_translate['subgenre'] = book.subgenre.name

        return fields_to_translate

    def _save_book_translations(self, book_id: int, translations: Dict[str, str]) -> bool:
        """Save translated fields to database with postprocessing"""
        try:
            # Postprocess all translations
            for key in translations:
                translations[key] = postprocess_translation(translations[key])

            with db_manager.get_session() as session:
                book = session.query(Book).filter(Book.id == book_id).first()
                if not book:
                    return False

                # Update translated fields
                if 'title' in translations:
                    book.title_translated = translations['title']

                if 'author' in translations:
                    book.author_translated = translations['author']

                if 'synopsis' in translations:
                    book.synopsis_translated = translations['synopsis']

                # Update genre translations (reject junk like "Unknown", single chars)
                if 'genre' in translations and book.genre:
                    genre_trans = translations['genre']
                    if genre_trans and len(genre_trans) >= 2 and genre_trans.lower() not in ('unknown', 'n/a', 'none', 'other'):
                        book.genre.name_translated = genre_trans
                    else:
                        logger.warning(f"Rejected junk genre translation '{genre_trans}' for genre '{book.genre.name}'")

                if 'subgenre' in translations and book.subgenre:
                    subgenre_trans = translations['subgenre']
                    if subgenre_trans and len(subgenre_trans) >= 2 and subgenre_trans.lower() not in ('unknown', 'n/a', 'none', 'other'):
                        book.subgenre.name_translated = subgenre_trans
                    else:
                        logger.warning(f"Rejected junk subgenre translation '{subgenre_trans}' for subgenre '{book.subgenre.name}'")

                book.updated_at = datetime.now(timezone.utc)
                session.commit()

                logger.info(f"Saved translations for book {book_id}")
                return True

        except Exception as e:
            logger.error(f"Failed to save book translations {book_id}: {e}")
            return False

    def _get_chapters_needing_translation(self, book_id: int, batch_size: int = 50) -> List[Chapter]:
        """Get chapters that need translation (skip null titles)"""
        with db_manager.get_session() as session:
            chapters = session.query(Chapter).filter(
                Chapter.book_id == book_id,
                Chapter.title_translated.is_(None),
                Chapter.title.is_not(None),
                Chapter.title != ''
            ).limit(batch_size).all()

            return chapters

    def _save_chapter_translations(self, chapter_translations: List[Tuple[int, str]]) -> int:
        """
        Save chapter translations to database with postprocessing
        Returns count of successfully saved translations
        """
        if not chapter_translations:
            return 0

        try:
            # Postprocess all chapter translations
            chapter_translations = [(chapter_id, postprocess_translation(title))
                                   for chapter_id, title in chapter_translations]

            now = datetime.now(timezone.utc)
            with db_manager.get_session() as session:
                for chapter_id, translated_title in chapter_translations:
                    session.execute(
                        update(Chapter)
                        .where(Chapter.id == chapter_id)
                        .values(title_translated=translated_title, updated_at=now)
                    )

                session.commit()
                saved_count = len(chapter_translations)
                logger.info(f"Saved {saved_count} chapter translations")
                return saved_count

        except Exception as e:
            logger.error(f"Failed to save chapter translations: {e}")
            return 0

def queue_all_chapter_translations(book_id: int) -> dict:
    """
    Count chapters needing translation and queue batches
    """
    try:
        with db_manager.get_session() as session:
            # Count total chapters needing translation for this book
            total_chapters = session.query(Chapter).filter(
                Chapter.book_id == book_id,
                Chapter.title_translated.is_(None),
                Chapter.title.is_not(None),
                Chapter.title != ''
            ).count()

            if total_chapters == 0:
                return {
                    'success': True,
                    'message': 'No chapters need translation',
                    'book_id': book_id,
                    'batches_queued': 0
                }

        # Queue batches
        from services.queue_manager import QueueManager
        queue_manager = QueueManager()

        batch_size = config.translation_batch_size
        batches_queued = 0

        for offset in range(0, total_chapters, batch_size):
            queue_manager.add_chapter_translation_batch(book_id, offset, batch_size)
            batches_queued += 1

        logger.info(f"Queued {batches_queued} chapter translation batches for book {book_id} ({total_chapters} chapters)")

        return {
            'success': True,
            'book_id': book_id,
            'total_chapters': total_chapters,
            'batches_queued': batches_queued,
            'batch_size': batch_size
        }

    except Exception as e:
        logger.error(f"Failed to queue chapter translations for book {book_id}: {e}")
        return {
            'success': False,
            'error': str(e),
            'book_id': book_id,
            'batches_queued': 0
        }

def queue_unscheduled_chapter_translations(book_id: int, unscheduled_chapters: list) -> dict:
    """
    Queue chapter translation batches for unscheduled chapters only
    """
    try:
        if not unscheduled_chapters:
            return {
                'success': True,
                'message': 'No unscheduled chapters need translation',
                'book_id': book_id,
                'batches_queued': 0,
                'total_chapters': 0
            }

        from services.queue_manager import QueueManager
        queue_manager = QueueManager()

        # Group chapters by batch based on sequence numbers
        batch_size = config.translation_batch_size
        batches_to_queue = {}

        for chapter in unscheduled_chapters:
            # Calculate which batch this chapter belongs to
            batch_offset = ((chapter.sequence_number - 1) // batch_size) * batch_size
            if batch_offset not in batches_to_queue:
                batches_to_queue[batch_offset] = []
            batches_to_queue[batch_offset].append(chapter)

        batches_queued = 0

        for batch_offset in sorted(batches_to_queue.keys()):
            # Only queue if this batch has unscheduled chapters
            queue_manager.add_chapter_translation_batch(book_id, batch_offset, batch_size)
            batches_queued += 1

        total_chapters = len(unscheduled_chapters)
        logger.info(f"Queued {batches_queued} chapter translation batches for book {book_id} ({total_chapters} unscheduled chapters)")

        return {
            'success': True,
            'book_id': book_id,
            'total_chapters': total_chapters,
            'batches_queued': batches_queued,
            'batch_size': batch_size
        }

    except Exception as e:
        logger.error(f"Failed to queue unscheduled chapter translations for book {book_id}: {e}")
        return {
            'success': False,
            'error': str(e),
            'book_id': book_id,
            'batches_queued': 0,
            'total_chapters': len(unscheduled_chapters) if unscheduled_chapters else 0
        }

def translate_book(book_id: int) -> dict:
    """
    Translate book fields using OpenAI API with validation and retries
    """
    worker = TranslationWorker()
    max_retries = 3

    # Work within a single session context to avoid DetachedInstanceError
    try:
        with db_manager.get_session() as session:
            # Get book within session
            book = session.query(Book).filter(Book.id == book_id).first()
            if not book:
                return {
                    'success': False,
                    'error': 'Book not found',
                    'book_id': book_id
                }

            # Check if book needs translation
            needs_translation = any([
                not book.title_translated,
                not book.author_translated,
                not book.synopsis_translated
            ])

            if not needs_translation:
                return {
                    'success': True,
                    'message': 'Book already fully translated',
                    'book_id': book_id,
                    'translated_fields': []
                }

            # Get fields to translate within same session
            fields_to_translate = worker._validate_fields_for_translation(book, session)

            # Check for existing author translations to maintain consistency
            if 'author' in fields_to_translate:
                existing_author_translation = session.query(Book.author_translated).filter(
                    Book.author == book.author,
                    Book.author_translated.is_not(None),
                    Book.author_translated != ''
                ).first()

                if existing_author_translation:
                    # Use existing translation for consistency
                    book.author_translated = existing_author_translation[0]
                    book.updated_at = datetime.now(timezone.utc)
                    session.commit()
                    logger.info(f"Reused existing author translation for '{book.author}': '{existing_author_translation[0]}'")
                    # Remove author from fields to translate since we handled it
                    del fields_to_translate['author']

            if not fields_to_translate:
                return {
                    'success': True,
                    'message': 'No fields need translation',
                    'book_id': book_id,
                    'translated_fields': []
                }

            # Attempt translation with per-field retries
            all_valid = {}
            remaining_fields = dict(fields_to_translate)

            for attempt in range(max_retries):
                if not remaining_fields:
                    break

                try:
                    logger.info(f"Translating book {book_id} (attempt {attempt + 1}/{max_retries}, fields: {list(remaining_fields.keys())})")

                    translations = worker.client.translate_book_fields(remaining_fields)

                    for field, translated_text in translations.items():
                        if field not in remaining_fields:
                            continue
                        is_valid, error_msg = worker.client.validate_translation(
                            remaining_fields[field],
                            translated_text,
                            field
                        )
                        if is_valid:
                            all_valid[field] = translated_text
                            del remaining_fields[field]
                        else:
                            logger.error(f"Validation failed for {field}: '{translated_text}'")

                    if remaining_fields and attempt < max_retries - 1:
                        logger.warning(f"Retrying failed fields: {list(remaining_fields.keys())}")
                        time.sleep(1)

                except Exception as e:
                    logger.error(f"Translation attempt {attempt + 1} failed: {e}")
                    if attempt < max_retries - 1:
                        time.sleep(2)
                        continue

            # Last resort: strip untranslatable Chinese from failed fields and accept
            if remaining_fields:
                for field in list(remaining_fields.keys()):
                    try:
                        translated = worker.client.translate_book_fields({field: remaining_fields[field]}).get(field, '')
                        cleaned = worker.client.strip_residual_chinese(translated, field)
                        if cleaned and not worker.client.has_chinese_characters(cleaned):
                            logger.info(f"Accepted {field} after stripping residual Chinese for book {book_id}")
                            all_valid[field] = cleaned
                            del remaining_fields[field]
                    except Exception:
                        pass

            # Final fallback: use OpenAI for fields that Google Translate completely failed on
            if remaining_fields:
                try:
                    openai_client = OpenAIClient()
                    openai_result = openai_client.translate_book_fields(remaining_fields)
                    for field in list(remaining_fields.keys()):
                        translated = openai_result.get(field, '')
                        if translated and not openai_client.has_chinese_characters(translated):
                            logger.info(f"OpenAI fallback succeeded for {field} on book {book_id}: '{translated}'")
                            all_valid[field] = translated
                            del remaining_fields[field]
                        elif translated:
                            # Try stripping residual Chinese from OpenAI result too
                            cleaned = worker.client.strip_residual_chinese(translated, field)
                            if cleaned and not worker.client.has_chinese_characters(cleaned):
                                logger.info(f"OpenAI fallback accepted {field} after stripping for book {book_id}")
                                all_valid[field] = cleaned
                                del remaining_fields[field]
                except Exception as e:
                    logger.warning(f"OpenAI fallback failed for book {book_id}: {e}")

            # Absolute last resort for authors: keep original Chinese so we stop retrying
            if 'author' in remaining_fields:
                original_author = remaining_fields['author']
                all_valid['author'] = original_author
                del remaining_fields['author']
                logger.info(f"Keeping original Chinese author '{original_author}' for book {book_id} (all translators failed)")

            if remaining_fields:
                logger.warning(f"Could not translate fields {list(remaining_fields.keys())} for book {book_id} after {max_retries} attempts")

            # Save whatever we got
            if all_valid:
                success = worker._save_book_translations(book_id, all_valid)
                if success:
                    try:
                        result = queue_all_chapter_translations(book_id)
                        if result['success']:
                            logger.info(f"Queued {result['batches_queued']} chapter translation batches for book {book_id}")
                        else:
                            logger.warning(f"Failed to queue chapter translations: {result.get('error', 'Unknown error')}")
                    except Exception as e:
                        logger.warning(f"Failed to queue chapter translation batches: {e}")

                    return {
                        'success': True,
                        'book_id': book_id,
                        'translated_fields': list(all_valid.keys()),
                        'failed_fields': list(remaining_fields.keys()),
                    }

            return {
                'success': False,
                'error': 'Translation failed after all retries',
                'book_id': book_id,
                'attempts': max_retries,
                'failed_fields': list(remaining_fields.keys()),
            }

    except Exception as e:
        logger.error(f"Session error in translate_book: {e}")
        return {
            'success': False,
            'error': f'Database session error: {e}',
            'book_id': book_id
        }



def queue_all_comment_translations(book_id: int, batch_size: int = None) -> dict:
    """
    Count untranslated comments for a book and queue batch translation jobs.
    Each batch job handles comments in a single API call.
    """
    batch_size = batch_size or config.translation_batch_size
    try:
        with db_manager.get_session() as session:
            comment_ids = session.query(BookComment.id).filter(
                BookComment.book_id == book_id,
                BookComment.content_translated.is_(None),
                BookComment.content.is_not(None),
                BookComment.content != ''
            ).order_by(BookComment.id).all()

            comment_ids = [c.id for c in comment_ids]

            if not comment_ids:
                return {
                    'success': True,
                    'message': 'No comments need translation',
                    'book_id': book_id,
                    'batches_queued': 0
                }

        from services.queue_manager import QueueManager
        queue_manager = QueueManager()

        batches_queued = 0
        for i in range(0, len(comment_ids), batch_size):
            batch_ids = comment_ids[i:i + batch_size]
            min_id = batch_ids[0]
            max_id = batch_ids[-1]
            queue_manager.add_comment_translation_batch(book_id, min_id, max_id)
            batches_queued += 1

        logger.info(f"Queued {batches_queued} comment translation batches for book {book_id} ({len(comment_ids)} comments)")

        return {
            'success': True,
            'book_id': book_id,
            'total_comments': len(comment_ids),
            'batches_queued': batches_queued,
            'batch_size': batch_size
        }

    except Exception as e:
        logger.error(f"Failed to queue comment translations for book {book_id}: {e}")
        return {
            'success': False,
            'error': str(e),
            'book_id': book_id,
            'batches_queued': 0
        }


def queue_all_nickname_translations(book_id: int, batch_size: int = None) -> dict:
    """
    Count untranslated QQ user nicknames for a book and queue batch translation jobs.
    Each batch job handles nicknames in a single API call.
    """
    batch_size = batch_size or config.translation_batch_size
    try:
        with db_manager.get_session() as session:
            user_ids = session.query(QQUser.id).join(BookComment).filter(
                BookComment.book_id == book_id,
                QQUser.nickname.is_not(None),
                QQUser.nickname != '',
                QQUser.nickname_translated.is_(None)
            ).distinct().order_by(QQUser.id).all()

            user_ids = [u.id for u in user_ids]

            if not user_ids:
                return {
                    'success': True,
                    'message': 'No nicknames need translation',
                    'book_id': book_id,
                    'batches_queued': 0
                }

        from services.queue_manager import QueueManager
        queue_manager = QueueManager()

        batches_queued = 0
        for i in range(0, len(user_ids), batch_size):
            batch_ids = user_ids[i:i + batch_size]
            min_id = batch_ids[0]
            max_id = batch_ids[-1]
            queue_manager.add_nickname_translation_batch(book_id, min_id, max_id)
            batches_queued += 1

        logger.info(f"Queued {batches_queued} nickname translation batches for book {book_id} ({len(user_ids)} nicknames)")

        return {
            'success': True,
            'book_id': book_id,
            'total_nicknames': len(user_ids),
            'batches_queued': batches_queued,
            'batch_size': batch_size
        }

    except Exception as e:
        logger.error(f"Failed to queue nickname translations for book {book_id}: {e}")
        return {
            'success': False,
            'error': str(e),
            'book_id': book_id,
            'batches_queued': 0
        }


def translate_comments(book_id: int, min_id: int, max_id: int) -> dict:
    """
    RQ worker: translate one batch of comments (by ID range) in a single API call.
    """
    worker = TranslationWorker()

    try:
        with db_manager.get_session() as session:
            comments = session.query(BookComment).filter(
                BookComment.book_id == book_id,
                BookComment.id >= min_id,
                BookComment.id <= max_id,
                BookComment.content_translated.is_(None),
                BookComment.content.is_not(None),
                BookComment.content != ''
            ).order_by(BookComment.id).all()

            if not comments:
                return {
                    'success': True,
                    'message': 'No comments need translation in this range',
                    'book_id': book_id,
                    'comments_translated': 0
                }

            logger.info(f"Translating {len(comments)} comments for book {book_id} (id range {min_id}-{max_id})")

            # Extract data while in session
            comment_data = [
                {'id': c.id, 'title': c.title or '', 'content': c.content or ''}
                for c in comments
            ]

        # Single API call for translation
        results = worker.client.translate_and_analyze_comments_batch(comment_data)

        # Save translations with direct UPDATE (no SELECT needed)
        saved_count = 0
        with db_manager.get_session() as session:
            for result in results:
                values = {}
                if result.get('title'):
                    values['title_translated'] = postprocess_translation(result['title'])
                if result.get('content'):
                    values['content_translated'] = postprocess_translation(result['content'])
                if values:
                    session.execute(
                        update(BookComment)
                        .where(BookComment.id == result['id'])
                        .values(**values)
                    )
                    saved_count += 1

            session.commit()
            logger.info(f"Saved {saved_count} comment translations for book {book_id}")

        return {
            'success': True,
            'book_id': book_id,
            'comments_translated': saved_count
        }

    except Exception as e:
        logger.error(f"Comment translation failed for book {book_id}: {e}")
        return {
            'success': False,
            'error': str(e),
            'book_id': book_id,
            'comments_translated': 0
        }


def translate_nicknames(book_id: int, min_id: int, max_id: int) -> dict:
    """
    RQ worker: translate one batch of QQ user nicknames (by user ID range) in a single API call.
    """
    worker = TranslationWorker()

    try:
        with db_manager.get_session() as session:
            users = session.query(QQUser).filter(
                QQUser.id >= min_id,
                QQUser.id <= max_id,
                QQUser.nickname.is_not(None),
                QQUser.nickname != '',
                QQUser.nickname_translated.is_(None)
            ).order_by(QQUser.id).all()

            if not users:
                return {
                    'success': True,
                    'message': 'No nicknames need translation in this range',
                    'book_id': book_id,
                    'nicknames_translated': 0
                }

            logger.info(f"Translating {len(users)} nicknames for book {book_id} (user id range {min_id}-{max_id})")

            # Build batch for chapter-style translation (nicknames are short like titles)
            nickname_data = [{'title': u.nickname, 'id': u.id} for u in users]

        # Single API call using chapter translator (nicknames are short strings)
        translated = worker.client.translate_chapters_batch(nickname_data, batch_size=config.translation_batch_size)

        # Save with direct UPDATE (no SELECT needed)
        saved_count = 0
        with db_manager.get_session() as session:
            for user_data, translated_name in zip(nickname_data, translated):
                if translated_name:
                    session.execute(
                        update(QQUser)
                        .where(QQUser.id == user_data['id'])
                        .values(nickname_translated=postprocess_translation(translated_name))
                    )
                    saved_count += 1
            session.commit()
            logger.info(f"Saved {saved_count} nickname translations for book {book_id}")

        return {
            'success': True,
            'book_id': book_id,
            'nicknames_translated': saved_count
        }

    except Exception as e:
        logger.error(f"Nickname translation failed for book {book_id}: {e}")
        return {
            'success': False,
            'error': str(e),
            'book_id': book_id,
            'nicknames_translated': 0
        }


def translate_chapters(book_id: int, batch_size: int = None, offset: int = 0) -> dict:
    """
    Translate chapter titles in batches with validation
    """
    batch_size = batch_size or config.translation_batch_size
    worker = TranslationWorker()

    try:
        # Work within a single session context to avoid DetachedInstanceError
        with db_manager.get_session() as session:
            # Get chapters in this sequence range that need translation
            start_sequence = offset + 1  # sequence_number starts at 1
            end_sequence = offset + batch_size

            chapters = session.query(Chapter).filter(
                Chapter.book_id == book_id,
                Chapter.title_translated.is_(None),
                Chapter.title.is_not(None),
                Chapter.title != '',
                Chapter.sequence_number >= start_sequence,
                Chapter.sequence_number <= end_sequence
            ).order_by(Chapter.sequence_number).all()

            if not chapters:
                return {
                    'success': True,
                    'message': 'No chapters need translation',
                    'book_id': book_id,
                    'chapters_translated': 0
                }

            logger.info(f"Translating {len(chapters)} chapters for book {book_id}")

            # Extract data while in session context
            chapter_data = []
            original_titles = {}
            for ch in chapters:
                chapter_data.append({'title': ch.title, 'id': ch.id})
                original_titles[ch.id] = ch.title

        # Call OpenAI API (outside session since we have the data)
        translated_titles = worker.client.translate_chapters_batch(chapter_data, batch_size)

        # Validate and prepare for database save
        valid_translations = []
        validation_errors = []

        for i, (ch_data, translated_title) in enumerate(zip(chapter_data, translated_titles)):
            is_valid, error_msg = worker.client.validate_translation(
                original_titles[ch_data['id']],
                translated_title,
                f"chapter_{ch_data['id']}"
            )

            if is_valid:
                valid_translations.append((ch_data['id'], translated_title))
            else:
                validation_errors.append(error_msg)

        # Save valid translations
        saved_count = worker._save_chapter_translations(valid_translations)

        return {
            'success': True,
            'book_id': book_id,
            'chapters_translated': saved_count,
            'validation_errors': validation_errors,
            'total_processed': len(chapter_data)
        }

    except Exception as e:
        logger.error(f"Chapter translation failed for book {book_id}: {e}")
        return {
            'success': False,
            'error': str(e),
            'book_id': book_id,
            'chapters_translated': 0
        }


def translate_booklist(booklist_id: int) -> dict:
    """Translate booklist title, description, tags, and item curator comments."""
    from core.models import QidianBooklist, QidianBooklistItem

    worker = TranslationWorker()

    try:
        with db_manager.get_session() as session:
            bl = session.query(QidianBooklist).filter(QidianBooklist.id == booklist_id).first()
            if not bl:
                return {'success': False, 'error': 'Booklist not found', 'booklist_id': booklist_id}

            # Translate title and description with dedicated booklist method
            fields = {}
            if bl.title and not bl.title_translated:
                fields['title'] = bl.title
            if bl.description and not bl.description_translated:
                fields['description'] = bl.description

            # Handle tags: reuse existing translations, only send untranslated ones to API
            tags_to_translate = []
            reused_tag_translations = {}
            if bl.tags and not bl.tags_translated:
                # Build lookup of existing tag translations from other booklists
                all_booklists_with_tags = session.query(
                    QidianBooklist.tags, QidianBooklist.tags_translated
                ).filter(
                    QidianBooklist.tags.is_not(None),
                    QidianBooklist.tags_translated.is_not(None),
                ).all()

                # Map Chinese tag -> English translation
                existing_translations = {}
                for tags, tags_trans in all_booklists_with_tags:
                    if tags and tags_trans and len(tags) == len(tags_trans):
                        for orig, trans in zip(tags, tags_trans):
                            if orig and trans:
                                existing_translations[orig] = trans

                # Split tags into reusable vs needs-translation
                for tag in bl.tags:
                    if tag in existing_translations:
                        reused_tag_translations[tag] = existing_translations[tag]
                    else:
                        tags_to_translate.append(tag)

                if tags_to_translate:
                    fields['tags'] = tags_to_translate

            translated_fields = []

            if fields:
                translations = worker.client.translate_booklist(fields)
                if translations:
                    if 'title' in translations:
                        bl.title_translated = postprocess_translation(translations['title'])
                        translated_fields.append('title')
                    if 'description' in translations:
                        bl.description_translated = postprocess_translation(translations['description'])
                        translated_fields.append('description')

                    # Merge API-translated tags with reused ones
                    if 'tags' in translations:
                        api_tags = {orig: trans for orig, trans in zip(tags_to_translate, translations['tags'])}
                        reused_tag_translations.update(api_tags)

            # Build final tags_translated array in same order as original tags
            if bl.tags and not bl.tags_translated and reused_tag_translations:
                bl.tags_translated = [
                    postprocess_translation(reused_tag_translations.get(tag, tag))
                    for tag in bl.tags
                ]
                translated_fields.append('tags')

            # Translate curator comments in a single batch API call
            items = session.query(QidianBooklistItem).filter(
                QidianBooklistItem.booklist_id == booklist_id,
                QidianBooklistItem.curator_comment.is_not(None),
                QidianBooklistItem.curator_comment != '',
                QidianBooklistItem.curator_comment_translated.is_(None),
            ).all()

            comments_translated = 0
            if items:
                comment_data = [{'id': item.id, 'comment': item.curator_comment} for item in items]
                items_by_id = {item.id: item for item in items}
                batch_size = config.translation_batch_size // 2

                for i in range(0, len(comment_data), batch_size):
                    batch = comment_data[i:i + batch_size]
                    try:
                        batch_results = worker.client.translate_booklist_comments_batch(batch)
                        for item_id, translated in batch_results.items():
                            if translated and item_id in items_by_id:
                                items_by_id[item_id].curator_comment_translated = postprocess_translation(translated)
                                comments_translated += 1
                    except Exception as e:
                        logger.warning(f"Batch curator comment translation failed for booklist {booklist_id} (batch {i // batch_size + 1}): {e}")

            session.commit()

        return {
            'success': True,
            'booklist_id': booklist_id,
            'translated_fields': translated_fields,
            'comments_translated': comments_translated,
        }

    except Exception as e:
        logger.error(f"Booklist translation failed for {booklist_id}: {e}")
        return {'success': False, 'error': str(e), 'booklist_id': booklist_id}