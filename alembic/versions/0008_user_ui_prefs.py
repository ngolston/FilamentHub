"""add ui_prefs column to users

Revision ID: 0008_user_ui_prefs
Revises: 0007_user_notification_prefs
Create Date: 2026-04-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_user_ui_prefs"
down_revision = "0007_user_notification_prefs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ui_prefs", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ui_prefs")
