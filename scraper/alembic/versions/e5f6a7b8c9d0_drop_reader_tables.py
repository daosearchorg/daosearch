"""drop reader-only tables

Removes the reader/translation feature tables that are no longer used by
the scraper or the application:

  - chapter_entity_occurrences
  - translated_chapters
  - user_book_entities
  - user_general_entities
  - user_translation_settings
  - book_sources
  - source_chapters (already dropped by c196603ea682; kept here as a
    defensive IF EXISTS in case it was recreated out of band)

KEEPS reading_progresses and reading_progress_histories (and ALL their
columns) fully intact -- they are shared with community rankings.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# FK-safe drop order: chapter_entity_occurrences references translated_chapters,
# user_book_entities and user_general_entities, so it must go first.
_TABLES = (
    'chapter_entity_occurrences',
    'translated_chapters',
    'user_book_entities',
    'user_general_entities',
    'user_translation_settings',
    'book_sources',
    'source_chapters',
)


def upgrade() -> None:
    """Drop reader-only tables. CASCADE handles FKs/indexes; IF EXISTS keeps
    this idempotent and safe regardless of which tables are still present."""
    for table in _TABLES:
        op.execute(f'DROP TABLE IF EXISTS {table} CASCADE')


def downgrade() -> None:
    """Reader tables are intentionally not restorable -- this is a feature
    removal, not a reversible schema tweak. No-op by design."""
    pass
