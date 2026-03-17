"""drop legacy entity tables

Revision ID: c3a8f2e91b04
Revises: bd5c7e515af7
Create Date: 2026-03-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c3a8f2e91b04'
down_revision: Union[str, Sequence[str], None] = 'bd5c7e515af7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop legacy entity tables that have been replaced by user_novel_entities."""
    # user_entity_overrides depends on novel_entities via FK, so drop it first
    op.drop_table('user_entity_overrides')
    op.drop_table('user_general_entities')
    op.drop_table('novel_entities')


def downgrade() -> None:
    """Recreate legacy entity tables."""
    op.create_table(
        'novel_entities',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('book_id', sa.Integer(), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('translated_name', sa.String(length=255), nullable=False),
        sa.Column('gender', sa.String(length=1), server_default='N', nullable=True),
        sa.Column('is_hidden', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('book_id', 'original_name', name='uq_novel_entity'),
    )
    op.create_index('idx_novel_entities_book_id', 'novel_entities', ['book_id'])

    op.create_table(
        'user_general_entities',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('translated_name', sa.String(length=255), nullable=False),
        sa.Column('gender', sa.String(length=1), server_default='N', nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'original_name', name='uq_user_general_entity'),
    )
    op.create_index('idx_user_general_entities_user_id', 'user_general_entities', ['user_id'])

    op.create_table(
        'user_entity_overrides',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('novel_entity_id', sa.Integer(), nullable=False),
        sa.Column('custom_name', sa.String(length=255), nullable=False),
        sa.Column('is_hidden', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['novel_entity_id'], ['novel_entities.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'novel_entity_id', name='uq_user_entity_override'),
    )
    op.create_index('idx_user_entity_overrides_user_id', 'user_entity_overrides', ['user_id'])
    op.create_index('idx_user_entity_overrides_entity_id', 'user_entity_overrides', ['novel_entity_id'])
