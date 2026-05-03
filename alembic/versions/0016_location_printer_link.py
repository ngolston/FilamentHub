"""link storage locations to printer slots

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-03
"""
from alembic import op
import sqlalchemy as sa

revision = '0016'
down_revision = '0015'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('storage_locations') as batch_op:
        batch_op.add_column(sa.Column('printer_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('slot_type', sa.String(10), nullable=True))
        batch_op.add_column(sa.Column('ams_unit_index', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('ams_slot_index', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_storage_location_printer',
            'printers', ['printer_id'], ['id'],
            ondelete='CASCADE',
        )


def downgrade() -> None:
    with op.batch_alter_table('storage_locations') as batch_op:
        batch_op.drop_constraint('fk_storage_location_printer', type_='foreignkey')
        batch_op.drop_column('ams_slot_index')
        batch_op.drop_column('ams_unit_index')
        batch_op.drop_column('slot_type')
        batch_op.drop_column('printer_id')
