"""Initial schema — all FilamentHub tables.

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    existing = {row[0] for row in conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'"))}

    # ── users ─────────────────────────────────────────────────────────────────
    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("hashed_password", sa.String(255), nullable=False),
            sa.Column("display_name", sa.String(100), nullable=False),
            sa.Column("maker_name", sa.String(100)),
            sa.Column("avatar_url", sa.String(500)),
            sa.Column("role", sa.String(20), nullable=False, server_default="editor"),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default="1"),
            sa.Column("is_verified", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("totp_secret", sa.String(32)),
            sa.Column("totp_enabled", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("preferred_weight_unit", sa.String(10), server_default="g"),
            sa.Column("preferred_temp_unit", sa.String(1), server_default="C"),
            sa.Column("preferred_currency", sa.String(3), server_default="USD"),
            sa.Column("timezone", sa.String(50), server_default="UTC"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_login_at", sa.DateTime(timezone=True)),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── api_keys ──────────────────────────────────────────────────────────────
    if "api_keys" not in existing:
        op.create_table(
            "api_keys",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("key_prefix", sa.String(12), nullable=False),
            sa.Column("hashed_key", sa.String(255), nullable=False),
            sa.Column("scopes", sa.String(200), server_default="read"),
            sa.Column("last_used_at", sa.DateTime(timezone=True)),
            sa.Column("expires_at", sa.DateTime(timezone=True)),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    # ── brands ────────────────────────────────────────────────────────────────
    if "brands" not in existing:
        op.create_table(
            "brands",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("website", sa.String(500)),
            sa.Column("country_of_origin", sa.String(100)),
            sa.Column("logo_url", sa.String(500)),
            sa.Column("notes", sa.Text),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_brands_name", "brands", ["name"], unique=True)

    # ── filament_profiles ─────────────────────────────────────────────────────
    if "filament_profiles" not in existing:
        op.create_table(
            "filament_profiles",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("brand_id", sa.Integer, sa.ForeignKey("brands.id", ondelete="SET NULL")),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("material", sa.String(50), nullable=False),
            sa.Column("color_name", sa.String(100)),
            sa.Column("color_hex", sa.String(7)),
            sa.Column("diameter", sa.Float, server_default="1.75"),
            sa.Column("density", sa.Float),
            sa.Column("print_temp_min", sa.Integer),
            sa.Column("print_temp_max", sa.Integer),
            sa.Column("bed_temp_min", sa.Integer),
            sa.Column("bed_temp_max", sa.Integer),
            sa.Column("max_print_speed", sa.Integer),
            sa.Column("drying_temp", sa.Integer),
            sa.Column("drying_duration", sa.Integer),
            sa.Column("is_community", sa.Boolean, server_default="0"),
            sa.Column("is_verified", sa.Boolean, server_default="0"),
            sa.Column("product_url", sa.String(500)),
            sa.Column("notes", sa.Text),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_filament_profiles_material", "filament_profiles", ["material"])
        op.create_index("ix_filament_profiles_brand_id", "filament_profiles", ["brand_id"])

    # ── storage_locations ─────────────────────────────────────────────────────
    if "storage_locations" not in existing:
        op.create_table(
            "storage_locations",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("description", sa.String(300)),
            sa.Column("is_dry_box", sa.Boolean, server_default="0"),
        )

    # ── spools ────────────────────────────────────────────────────────────────
    if "spools" not in existing:
        op.create_table(
            "spools",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("filament_id", sa.Integer, sa.ForeignKey("filament_profiles.id", ondelete="SET NULL")),
            sa.Column("brand_id", sa.Integer, sa.ForeignKey("brands.id", ondelete="SET NULL")),
            sa.Column("location_id", sa.Integer, sa.ForeignKey("storage_locations.id", ondelete="SET NULL")),
            sa.Column("name", sa.String(200)),
            sa.Column("lot_nr", sa.String(100)),
            sa.Column("photo_url", sa.String(500)),
            sa.Column("initial_weight", sa.Float, nullable=False),
            sa.Column("spool_weight", sa.Float),
            sa.Column("used_weight", sa.Float, nullable=False, server_default="0"),
            sa.Column("purchase_date", sa.DateTime(timezone=True)),
            sa.Column("purchase_price", sa.Float),
            sa.Column("supplier", sa.String(200)),
            sa.Column("product_url", sa.String(500)),
            sa.Column("status", sa.String(20), server_default="active"),
            sa.Column("notes", sa.Text),
            sa.Column("registered", sa.DateTime(timezone=True), nullable=False),
            sa.Column("first_used", sa.DateTime(timezone=True)),
            sa.Column("last_used", sa.DateTime(timezone=True)),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_spools_owner_id", "spools", ["owner_id"])
        op.create_index("ix_spools_status", "spools", ["status"])

    # ── weight_logs ───────────────────────────────────────────────────────────
    if "weight_logs" not in existing:
        op.create_table(
            "weight_logs",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("spool_id", sa.Integer, sa.ForeignKey("spools.id", ondelete="CASCADE"), nullable=False),
            sa.Column("measured_weight", sa.Float, nullable=False),
            sa.Column("net_weight", sa.Float, nullable=False),
            sa.Column("notes", sa.String(300)),
            sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        )

    # ── printers ──────────────────────────────────────────────────────────────
    if "printers" not in existing:
        op.create_table(
            "printers",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("model", sa.String(100)),
            sa.Column("connection_type", sa.String(20), server_default="manual"),
            sa.Column("api_url", sa.String(500)),
            sa.Column("api_key", sa.String(200)),
            sa.Column("status", sa.String(20), server_default="offline"),
            sa.Column("notes", sa.Text),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        )

    # ── ams_units + ams_slots ─────────────────────────────────────────────────
    if "ams_units" not in existing:
        op.create_table(
            "ams_units",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("printer_id", sa.Integer, sa.ForeignKey("printers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("unit_index", sa.Integer, nullable=False, server_default="0"),
            sa.Column("name", sa.String(100), server_default="AMS 1"),
        )
    if "ams_slots" not in existing:
        op.create_table(
            "ams_slots",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("ams_unit_id", sa.Integer, sa.ForeignKey("ams_units.id", ondelete="CASCADE"), nullable=False),
            sa.Column("slot_index", sa.Integer, nullable=False),
            sa.Column("spool_id", sa.Integer, sa.ForeignKey("spools.id", ondelete="SET NULL")),
            sa.UniqueConstraint("ams_unit_id", "slot_index"),
        )

    # ── print_jobs ────────────────────────────────────────────────────────────
    if "print_jobs" not in existing:
        op.create_table(
            "print_jobs",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("printer_id", sa.Integer, sa.ForeignKey("printers.id", ondelete="SET NULL")),
            sa.Column("spool_id", sa.Integer, sa.ForeignKey("spools.id", ondelete="SET NULL")),
            sa.Column("file_name", sa.String(300)),
            sa.Column("filament_used_g", sa.Float, nullable=False),
            sa.Column("duration_seconds", sa.Integer),
            sa.Column("outcome", sa.String(20), server_default="success"),
            sa.Column("notes", sa.Text),
            sa.Column("started_at", sa.DateTime(timezone=True)),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_print_jobs_user_id", "print_jobs", ["user_id"])
        op.create_index("ix_print_jobs_spool_id", "print_jobs", ["spool_id"])
        op.create_index("ix_print_jobs_finished_at", "print_jobs", ["finished_at"])

    # ── drying_sessions ───────────────────────────────────────────────────────
    if "drying_sessions" not in existing:
        op.create_table(
            "drying_sessions",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("spool_id", sa.Integer, sa.ForeignKey("spools.id", ondelete="CASCADE"), nullable=False),
            sa.Column("drying_temp", sa.Integer, nullable=False),
            sa.Column("target_duration_hours", sa.Integer, nullable=False),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("finished_at", sa.DateTime(timezone=True)),
            sa.Column("humidity_before", sa.Float),
            sa.Column("humidity_after", sa.Float),
            sa.Column("notes", sa.Text),
        )

    # ── alert_rules ───────────────────────────────────────────────────────────
    if "alert_rules" not in existing:
        op.create_table(
            "alert_rules",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("low_threshold_pct", sa.Float, server_default="20.0"),
            sa.Column("critical_threshold_pct", sa.Float, server_default="10.0"),
            sa.Column("material_filter", sa.String(50)),
            sa.Column("notify_discord", sa.Boolean, server_default="1"),
            sa.Column("notify_email", sa.Boolean, server_default="0"),
            sa.Column("is_active", sa.Boolean, server_default="1"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("alert_rules")
    op.drop_table("drying_sessions")
    op.drop_table("print_jobs")
    op.drop_table("ams_slots")
    op.drop_table("ams_units")
    op.drop_table("printers")
    op.drop_table("weight_logs")
    op.drop_table("spools")
    op.drop_table("storage_locations")
    op.drop_table("filament_profiles")
    op.drop_table("brands")
    op.drop_table("api_keys")
    op.drop_table("users")
