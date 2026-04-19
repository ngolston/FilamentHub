"""add webhooks table

Revision ID: 0006_webhooks
Revises: 0005_user_discord_webhook
Create Date: 2026-04-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_webhooks"
down_revision = "0005_user_discord_webhook"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "webhooks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("events", sa.String(300), nullable=False, server_default=""),
        sa.Column("secret", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status_code", sa.Integer(), nullable=True),
    )
    op.create_index("ix_webhooks_owner_id", "webhooks", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_webhooks_owner_id", table_name="webhooks")
    op.drop_table("webhooks")
