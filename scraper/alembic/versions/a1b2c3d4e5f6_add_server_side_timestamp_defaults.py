"""Add server-side timestamp defaults

Revision ID: a1b2c3d4e5f6
Revises: 6215c7139f9b
Create Date: 2026-02-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '6215c7139f9b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# All (table, column) pairs that need DEFAULT now()
TIMESTAMP_COLUMNS = [
    ("genres", "created_at"),
    ("genres", "updated_at"),
    ("books", "created_at"),
    ("books", "updated_at"),
    ("chapters", "created_at"),
    ("chapters", "updated_at"),
    ("users", "created_at"),
    ("users", "updated_at"),
    ("book_ratings", "created_at"),
    ("book_ratings", "updated_at"),
    ("book_reviews", "created_at"),
    ("book_reviews", "updated_at"),
    ("review_likes", "created_at"),
    ("reading_progresses", "created_at"),
    ("reading_progresses", "updated_at"),
    ("reading_progresses", "last_read_at"),
    ("reading_progress_histories", "recorded_at"),
    ("bookmarks", "created_at"),
    ("qq_users", "created_at"),
    ("qq_users", "updated_at"),
    ("book_comments", "created_at"),
    ("book_comments", "updated_at"),
]


def upgrade() -> None:
    for table, column in TIMESTAMP_COLUMNS:
        op.execute(
            f'ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT now()'
        )


def downgrade() -> None:
    for table, column in TIMESTAMP_COLUMNS:
        op.execute(
            f'ALTER TABLE {table} ALTER COLUMN {column} DROP DEFAULT'
        )
