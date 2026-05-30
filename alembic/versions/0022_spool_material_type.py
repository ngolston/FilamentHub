"""add material_type to spools

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-30
"""
from alembic import op
import sqlalchemy as sa

revision = '0022'
down_revision = '0021'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('spools') as batch_op:
        batch_op.add_column(sa.Column('material_type', sa.String(100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('spools') as batch_op:
        batch_op.drop_column('material_type')
