"""Add photo_url to filament_profiles

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = '0021'
down_revision = '0020'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('filament_profiles') as batch_op:
        batch_op.add_column(sa.Column('photo_url', sa.String(500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('filament_profiles') as batch_op:
        batch_op.drop_column('photo_url')
