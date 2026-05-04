"""print job enhancements: plate number, multiple spools, photos

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-04
"""
from alembic import op
import sqlalchemy as sa

revision = '0017'
down_revision = '0016'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add plate_number; make filament_used_g nullable (total is now sum of spools)
    with op.batch_alter_table('print_jobs') as batch_op:
        batch_op.add_column(sa.Column('plate_number', sa.Integer(), nullable=True))
        batch_op.alter_column('filament_used_g', existing_type=sa.Float(), nullable=True)

    op.create_table(
        'print_job_spools',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('print_job_id', sa.Integer(), nullable=False),
        sa.Column('spool_id', sa.Integer(), nullable=True),
        sa.Column('filament_used_g', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['print_job_id'], ['print_jobs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['spool_id'], ['spools.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_print_job_spools_print_job_id', 'print_job_spools', ['print_job_id'])

    op.create_table(
        'print_job_photos',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('print_job_id', sa.Integer(), nullable=False),
        sa.Column('url', sa.String(500), nullable=False),
        sa.ForeignKeyConstraint(['print_job_id'], ['print_jobs.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_print_job_photos_print_job_id', 'print_job_photos', ['print_job_id'])


def downgrade() -> None:
    op.drop_index('ix_print_job_photos_print_job_id', table_name='print_job_photos')
    op.drop_table('print_job_photos')
    op.drop_index('ix_print_job_spools_print_job_id', table_name='print_job_spools')
    op.drop_table('print_job_spools')
    with op.batch_alter_table('print_jobs') as batch_op:
        batch_op.alter_column('filament_used_g', existing_type=sa.Float(), nullable=False)
        batch_op.drop_column('plate_number')
