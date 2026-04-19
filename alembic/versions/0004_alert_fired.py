"""Add alert_fired table for notification deduplication.

Revision ID: 0004_alert_fired
Revises: 0003_auth_tokens
Create Date: 2026-04-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_alert_fired"
down_revision: Union[str, None] = "0003_auth_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alert_fired",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.Column("spool_id", sa.Integer(), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("fired_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["rule_id"], ["alert_rules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["spool_id"], ["spools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alert_fired_rule_spool", "alert_fired", ["rule_id", "spool_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_alert_fired_rule_spool", table_name="alert_fired")
    op.drop_table("alert_fired")
