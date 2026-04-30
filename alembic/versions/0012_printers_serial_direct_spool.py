"""add serial_number and direct_spool_id to printers

Revision ID: 0012_printers_serial_direct_spool
Revises: 0011_system_config_allow_registration
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = '0012_printers_serial_direct_spool'
down_revision = '0011_system_config_allow_registration'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = [c['name'] for c in inspector.get_columns('printers')]
    if 'serial_number' not in existing:
        op.add_column(
            'printers',
            sa.Column('serial_number', sa.String(100), nullable=True),
        )
    if 'direct_spool_id' not in existing:
        op.add_column(
            'printers',
            sa.Column('direct_spool_id', sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column('printers', 'direct_spool_id')
    op.drop_column('printers', 'serial_number')
