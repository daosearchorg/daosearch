"""multi-source progress and cache key changes

Revision ID: a1b2c3d4e5f7
Revises: f11d6f700590
Create Date: 2026-03-18 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, Sequence[str], None] = 'f11d6f700590'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # translated_chapters: add source_url column
    op.add_column('translated_chapters', sa.Column('source_url', sa.String(1000), nullable=True))

    # translated_chapters: drop old unique constraint, create new one on (user_id, book_id, source_url)
    op.drop_constraint('uq_translated_chapter', 'translated_chapters', type_='unique')
    op.create_unique_constraint('uq_translated_chapter_url', 'translated_chapters', ['user_id', 'book_id', 'source_url'])

    # translated_chapters: make chapter_seq nullable
    op.alter_column('translated_chapters', 'chapter_seq',
                     existing_type=sa.Integer(),
                     nullable=True)

    # reading_progresses: drop old unique constraint, create new one on (user_id, book_id, source_domain)
    op.drop_constraint('uq_user_book_progress', 'reading_progresses', type_='unique')
    op.create_unique_constraint('uq_user_book_progress_domain', 'reading_progresses', ['user_id', 'book_id', 'source_domain'])


def downgrade() -> None:
    """Downgrade schema."""
    # reading_progresses: restore original unique constraint
    op.drop_constraint('uq_user_book_progress_domain', 'reading_progresses', type_='unique')
    op.create_unique_constraint('uq_user_book_progress', 'reading_progresses', ['user_id', 'book_id'])

    # translated_chapters: make chapter_seq non-nullable again
    op.alter_column('translated_chapters', 'chapter_seq',
                     existing_type=sa.Integer(),
                     nullable=False)

    # translated_chapters: restore original unique constraint
    op.drop_constraint('uq_translated_chapter_url', 'translated_chapters', type_='unique')
    op.create_unique_constraint('uq_translated_chapter', 'translated_chapters', ['user_id', 'book_id', 'chapter_seq'])

    # translated_chapters: drop source_url column
    op.drop_column('translated_chapters', 'source_url')
