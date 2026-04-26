"""Add refresh_tokens, password_reset_tokens tables; add alert_rules table; fix users.is_verified default.

Revision ID: 0003_auth_tokens
Revises: 0002_spool_extra_colors
Create Date: 2026-04-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_auth_tokens"
down_revision: Union[str, None] = "0002_spool_extra_colors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    existing = {row[0] for row in conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'"))}

    # ── refresh_tokens ────────────────────────────────────────────────────────
    if "refresh_tokens" not in existing:
        op.create_table(
            "refresh_tokens",
            sa.Column("id",           sa.Integer(),     primary_key=True, autoincrement=True),
            sa.Column("user_id",      sa.String(36),    sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token_hash",   sa.String(64),    nullable=False, unique=True),
            sa.Column("device_name",  sa.String(200),   nullable=True),
            sa.Column("ip_address",   sa.String(45),    nullable=True),
            sa.Column("created_at",   sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("expires_at",   sa.DateTime(timezone=True), nullable=False),
            sa.Column("is_revoked",   sa.Boolean(),     nullable=False, server_default=sa.false()),
        )
        op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)
        op.create_index("ix_refresh_tokens_user_id",   "refresh_tokens", ["user_id"])

    # ── password_reset_tokens ─────────────────────────────────────────────────
    if "password_reset_tokens" not in existing:
        op.create_table(
            "password_reset_tokens",
            sa.Column("id",         sa.Integer(),     primary_key=True, autoincrement=True),
            sa.Column("user_id",    sa.String(36),    sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token_hash", sa.String(64),    nullable=False, unique=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at",    sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"], unique=True)

    # ── alert_rules ───────────────────────────────────────────────────────────
    if "alert_rules" not in existing:
        op.create_table(
            "alert_rules",
            sa.Column("id",                     sa.Integer(),  primary_key=True, autoincrement=True),
            sa.Column("owner_id",               sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name",                   sa.String(100), nullable=False),
            sa.Column("low_threshold_pct",      sa.Float(),    nullable=False, server_default="20.0"),
            sa.Column("critical_threshold_pct", sa.Float(),    nullable=False, server_default="10.0"),
            sa.Column("material_filter",        sa.String(50), nullable=True),
            sa.Column("notify_discord",         sa.Boolean(),  nullable=False, server_default=sa.true()),
            sa.Column("notify_email",           sa.Boolean(),  nullable=False, server_default=sa.false()),
            sa.Column("is_active",              sa.Boolean(),  nullable=False, server_default=sa.true()),
            sa.Column("created_at",             sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    # ── users: set is_verified default to true for existing rows ─────────────
    op.execute("UPDATE users SET is_verified = 1 WHERE is_verified = 0")


def downgrade() -> None:
    op.drop_table("alert_rules")
    op.drop_index("ix_password_reset_tokens_token_hash", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_index("ix_refresh_tokens_user_id",   table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
