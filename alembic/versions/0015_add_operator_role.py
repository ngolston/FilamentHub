"""add operator role

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-01
"""
from alembic import op
import sqlalchemy as sa

revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite doesn't support ALTER COLUMN; use batch mode to rebuild the table
    # with the updated CHECK constraint that includes 'operator'.
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column(
            'role',
            existing_type=sa.Enum('admin', 'editor', 'viewer', name='userrole'),
            type_=sa.Enum('admin', 'editor', 'operator', 'viewer', name='userrole'),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column(
            'role',
            existing_type=sa.Enum('admin', 'editor', 'operator', 'viewer', name='userrole'),
            type_=sa.Enum('admin', 'editor', 'viewer', name='userrole'),
            existing_nullable=False,
        )
