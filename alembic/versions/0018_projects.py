"""projects table and project_id on print_jobs

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-04
"""
from alembic import op
import sqlalchemy as sa

revision = '0018'
down_revision = '0017'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'projects',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(300), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_projects_user_id', 'projects', ['user_id'])

    with op.batch_alter_table('print_jobs') as batch_op:
        batch_op.add_column(sa.Column('project_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_print_jobs_project_id',
            'projects', ['project_id'], ['id'],
            ondelete='SET NULL',
        )


def downgrade() -> None:
    with op.batch_alter_table('print_jobs') as batch_op:
        batch_op.drop_constraint('fk_print_jobs_project_id', type_='foreignkey')
        batch_op.drop_column('project_id')

    op.drop_index('ix_projects_user_id', table_name='projects')
    op.drop_table('projects')
