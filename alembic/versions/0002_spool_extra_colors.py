"""Add extra_color_hex_2/3/4 columns to spools.

Revision ID: 0002_spool_extra_colors
Revises: 0001_initial
Create Date: 2026-04-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_spool_extra_colors"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("spools", sa.Column("extra_color_hex_2", sa.String(7), nullable=True))
    op.add_column("spools", sa.Column("extra_color_hex_3", sa.String(7), nullable=True))
    op.add_column("spools", sa.Column("extra_color_hex_4", sa.String(7), nullable=True))


def downgrade() -> None:
    op.drop_column("spools", "extra_color_hex_4")
    op.drop_column("spools", "extra_color_hex_3")
    op.drop_column("spools", "extra_color_hex_2")
