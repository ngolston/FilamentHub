"""add system_config table

Revision ID: 0009_system_config
Revises: 0008_user_ui_prefs
Create Date: 2026-04-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_system_config"
down_revision = "0008_user_ui_prefs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    existing = {row[0] for row in conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'"))}

    if "system_config" not in existing:
        op.create_table(
            "system_config",
            sa.Column("id", sa.Integer(), primary_key=True, default=1),
            sa.Column("smtp_host", sa.String(255), nullable=True),
            sa.Column("smtp_port", sa.Integer(), nullable=True),
            sa.Column("smtp_user", sa.String(255), nullable=True),
            sa.Column("smtp_password", sa.String(255), nullable=True),
            sa.Column("smtp_from", sa.String(255), nullable=True),
            sa.Column("smtp_tls", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
        )


def downgrade() -> None:
    op.drop_table("system_config")
