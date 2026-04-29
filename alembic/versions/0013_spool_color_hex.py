"""add color_hex to spools

Revision ID: 0013_spool_color_hex
Revises: 0012_printers_serial_direct_spool
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = '0013_spool_color_hex'
down_revision = '0012_printers_serial_direct_spool'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = [c['name'] for c in inspector.get_columns('spools')]
    if 'color_hex' not in existing:
        op.add_column(
            'spools',
            sa.Column('color_hex', sa.String(7), nullable=True),
        )


def downgrade() -> None:
    op.drop_column('spools', 'color_hex')
