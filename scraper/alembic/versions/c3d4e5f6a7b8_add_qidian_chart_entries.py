"""add qidian_chart_entries

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-17 19:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'qidian_chart_entries',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('rank_type', sa.String(length=20), nullable=False),
        sa.Column('genre_channel', sa.String(length=16), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('page', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('book_id', sa.Integer(), nullable=False),
        sa.Column('scraped_at', sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_qidian_chart_entries_lookup', 'qidian_chart_entries',
                    ['rank_type', 'genre_channel', 'position'])
    op.create_index('idx_qidian_chart_entries_book_id', 'qidian_chart_entries',
                    ['book_id'])


def downgrade() -> None:
    op.drop_index('idx_qidian_chart_entries_book_id',
                  table_name='qidian_chart_entries')
    op.drop_index('idx_qidian_chart_entries_lookup',
                  table_name='qidian_chart_entries')
    op.drop_table('qidian_chart_entries')
