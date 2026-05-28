"""Add plate_data and comments columns to projects

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa

revision = '0020'
down_revision = '0019'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('projects') as batch_op:
        batch_op.add_column(sa.Column('plate_data', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('comments',   sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('projects') as batch_op:
        batch_op.drop_column('comments')
        batch_op.drop_column('plate_data')
