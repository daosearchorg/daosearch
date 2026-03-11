"""add qq_charts and catalog tables

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-02-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('qq_chart_entries',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('gender', sa.String(length=10), nullable=False),
        sa.Column('rank_type', sa.String(length=20), nullable=False),
        sa.Column('cycle', sa.String(length=10), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('page', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('book_id', sa.Integer(), nullable=False),
        sa.Column('scraped_at', postgresql.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_qq_chart_entries_lookup', 'qq_chart_entries', ['gender', 'rank_type', 'cycle', 'position'], unique=False)
    op.create_index('idx_qq_chart_entries_book_id', 'qq_chart_entries', ['book_id'], unique=False)

    op.create_table('qq_catalog_entries',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('subcategory_id', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('finish_status', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('price_status', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('page', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('book_id', sa.Integer(), nullable=False),
        sa.Column('scraped_at', postgresql.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_qq_catalog_entries_lookup', 'qq_catalog_entries', ['category_id', 'subcategory_id', 'finish_status', 'price_status', 'page', 'position'], unique=False)
    op.create_index('idx_qq_catalog_entries_book_id', 'qq_catalog_entries', ['book_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_qq_catalog_entries_book_id', table_name='qq_catalog_entries')
    op.drop_index('idx_qq_catalog_entries_lookup', table_name='qq_catalog_entries')
    op.drop_table('qq_catalog_entries')
    op.drop_index('idx_qq_chart_entries_book_id', table_name='qq_chart_entries')
    op.drop_index('idx_qq_chart_entries_lookup', table_name='qq_chart_entries')
    op.drop_table('qq_chart_entries')
