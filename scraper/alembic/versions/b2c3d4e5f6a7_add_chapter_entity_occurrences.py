"""add chapter_entity_occurrences table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f7
Create Date: 2026-03-18 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('chapter_entity_occurrences',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('translated_chapter_id', sa.Integer(), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('general_entity_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['translated_chapter_id'], ['translated_chapters.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['entity_id'], ['user_book_entities.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['general_entity_id'], ['user_general_entities.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('translated_chapter_id', 'entity_id', name='uq_chapter_entity_book'),
        sa.UniqueConstraint('translated_chapter_id', 'general_entity_id', name='uq_chapter_entity_general'),
    )
    op.create_index('idx_chapter_entity_entity', 'chapter_entity_occurrences', ['entity_id'])
    op.create_index('idx_chapter_entity_general', 'chapter_entity_occurrences', ['general_entity_id'])


def downgrade() -> None:
    op.drop_index('idx_chapter_entity_general', table_name='chapter_entity_occurrences')
    op.drop_index('idx_chapter_entity_entity', table_name='chapter_entity_occurrences')
    op.drop_table('chapter_entity_occurrences')
