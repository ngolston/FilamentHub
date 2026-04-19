"""add allow_registration to system_config

Revision ID: 0011_system_config_allow_registration
Revises: 0010_user_integration_configs
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = '0011_system_config_allow_registration'
down_revision = '0010_user_integration_configs'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Column may already exist if it was applied manually — skip if so
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = [c['name'] for c in inspector.get_columns('system_config')]
    if 'allow_registration' not in existing:
        op.add_column(
            'system_config',
            sa.Column('allow_registration', sa.Boolean(), nullable=False, server_default='1'),
        )


def downgrade() -> None:
    op.drop_column('system_config', 'allow_registration')
