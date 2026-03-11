"""rename recommendation_qidian_ids to recommendation_qq_ids

Revision ID: 704b2694ec0a
Revises: 48203f2482ca
Create Date: 2026-03-07 23:18:59.025588

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '704b2694ec0a'
down_revision: Union[str, Sequence[str], None] = '48203f2482ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('books', 'recommendation_qidian_ids', new_column_name='recommendation_qq_ids')


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('books', 'recommendation_qq_ids', new_column_name='recommendation_qidian_ids')
