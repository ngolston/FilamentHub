"""Extend projects table with description, status, client, priority, and estimate fields

Revision ID: 0019
Revises: 0018
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa

revision = '0019'
down_revision = '0018'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('projects') as batch_op:
        batch_op.add_column(sa.Column('description',                  sa.Text(),         nullable=True))
        batch_op.add_column(sa.Column('status',                       sa.String(100),    nullable=True))
        batch_op.add_column(sa.Column('client_requestor',             sa.String(300),    nullable=True))
        batch_op.add_column(sa.Column('design_link',                  sa.String(500),    nullable=True))
        batch_op.add_column(sa.Column('is_priority',                  sa.Boolean(),      nullable=False, server_default='false'))
        batch_op.add_column(sa.Column('designer',                     sa.String(300),    nullable=True))
        batch_op.add_column(sa.Column('estimated_print_time_seconds', sa.Integer(),      nullable=True))
        batch_op.add_column(sa.Column('filament_estimates',           sa.Text(),         nullable=True))  # JSON


def downgrade() -> None:
    with op.batch_alter_table('projects') as batch_op:
        batch_op.drop_column('filament_estimates')
        batch_op.drop_column('estimated_print_time_seconds')
        batch_op.drop_column('designer')
        batch_op.drop_column('is_priority')
        batch_op.drop_column('design_link')
        batch_op.drop_column('client_requestor')
        batch_op.drop_column('status')
        batch_op.drop_column('description')
