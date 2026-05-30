"""add material override to spools

Revision ID: 0023
Revises: 0022
Create Date: 2026-05-30
"""
from alembic import op
import sqlalchemy as sa

revision = '0023'
down_revision = '0022'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('spools') as batch_op:
        batch_op.add_column(sa.Column('material', sa.String(50), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('spools') as batch_op:
        batch_op.drop_column('material')
