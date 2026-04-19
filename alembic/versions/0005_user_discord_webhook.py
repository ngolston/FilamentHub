"""Add discord_webhook_url to users table.

Revision ID: 0005_user_discord_webhook
Revises: 0004_alert_fired
Create Date: 2026-04-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_user_discord_webhook"
down_revision: Union[str, None] = "0004_alert_fired"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("discord_webhook_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "discord_webhook_url")
