"""add bambu_config and ha_config to users

Revision ID: 0010_user_integration_configs
Revises: 0009_system_config
Create Date: 2026-04-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_user_integration_configs"
down_revision = "0009_system_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("bambu_config", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("ha_config",    sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ha_config")
    op.drop_column("users", "bambu_config")
