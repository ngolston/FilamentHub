"""add notification_prefs column to users

Revision ID: 0007_user_notification_prefs
Revises: 0006_webhooks
Create Date: 2026-04-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_user_notification_prefs"
down_revision = "0006_webhooks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("notification_prefs", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "notification_prefs")
