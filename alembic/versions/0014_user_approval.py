"""add user approval flag

Revision ID: 0014
Revises: 0013_spool_color_hex
Create Date: 2026-05-01
"""
from alembic import op
import sqlalchemy as sa

revision = '0014'
down_revision = '0013_spool_color_hex'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_approved', sa.Boolean(), nullable=False, server_default='1'))


def downgrade() -> None:
    op.drop_column('users', 'is_approved')
