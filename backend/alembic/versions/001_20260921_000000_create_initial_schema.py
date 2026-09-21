"""Create initial schema for multi-tenant CRM

Revision ID: 001_20260921_000000
Revises:
Create Date: 2026-09-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_20260921_000000'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create initial tables for multi-tenant architecture"""

    # Enable required PostgreSQL extensions
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "pg_trgm"')

    # Create schema for organization data
    op.execute('CREATE SCHEMA IF NOT EXISTS crm_core')

    # Create organizations table
    op.create_table(
        'organizations',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(255), nullable=False, unique=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('metadata_json', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
        schema='crm_core'
    )
    op.create_index('idx_organizations_slug', 'organizations', ['slug'], schema='crm_core')
    op.create_index('idx_organizations_created_at', 'organizations', ['created_at'], schema='crm_core')

    # Create user roles enum
    user_role_enum = postgresql.ENUM('admin', 'manager', 'sales_rep', 'viewer', name='user_role')
    user_role_enum.create(op.get_bind(), checkfirst=True)

    # Create users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', user_role_enum, server_default='viewer', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('email_verified', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('last_login', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['crm_core.organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='crm_core'
    )
    op.create_index('idx_users_organization_id', 'users', ['organization_id'], schema='crm_core')
    op.create_index('idx_users_email', 'users', ['email'], schema='crm_core')
    op.create_index('idx_users_created_at', 'users', ['created_at'], schema='crm_core')

    # Create audit_logs table for compliance
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('changes', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['crm_core.organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['crm_core.users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        schema='crm_core'
    )
    op.create_index('idx_audit_logs_organization_id', 'audit_logs', ['organization_id'], schema='crm_core')
    op.create_index('idx_audit_logs_user_id', 'audit_logs', ['user_id'], schema='crm_core')
    op.create_index('idx_audit_logs_action', 'audit_logs', ['action'], schema='crm_core')
    op.create_index('idx_audit_logs_created_at', 'audit_logs', ['created_at'], schema='crm_core')


def downgrade() -> None:
    """Drop all tables and schema"""
    # Drop indexes
    op.drop_index('idx_audit_logs_created_at', table_name='audit_logs', schema='crm_core')
    op.drop_index('idx_audit_logs_action', table_name='audit_logs', schema='crm_core')
    op.drop_index('idx_audit_logs_user_id', table_name='audit_logs', schema='crm_core')
    op.drop_index('idx_audit_logs_organization_id', table_name='audit_logs', schema='crm_core')

    op.drop_index('idx_users_created_at', table_name='users', schema='crm_core')
    op.drop_index('idx_users_email', table_name='users', schema='crm_core')
    op.drop_index('idx_users_organization_id', table_name='users', schema='crm_core')

    op.drop_index('idx_organizations_created_at', table_name='organizations', schema='crm_core')
    op.drop_index('idx_organizations_slug', table_name='organizations', schema='crm_core')

    # Drop tables
    op.drop_table('audit_logs', schema='crm_core')
    op.drop_table('users', schema='crm_core')
    op.drop_table('organizations', schema='crm_core')

    # Drop enum
    user_role_enum = postgresql.ENUM('admin', 'manager', 'sales_rep', 'viewer', name='user_role')
    user_role_enum.drop(op.get_bind(), checkfirst=True)

    # Drop schema
    op.execute('DROP SCHEMA IF EXISTS crm_core')

    # Drop extensions
    op.execute('DROP EXTENSION IF EXISTS "pg_trgm"')
    op.execute('DROP EXTENSION IF EXISTS "uuid-ossp"')
