"""Seed development data including default organization

Revision ID: 002_20260921_000100
Revises: 001_20260921_000000
Create Date: 2026-09-21 00:01:00.000000

"""
from alembic import op
import sqlalchemy as sa
from uuid import uuid4
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_20260921_000100'
down_revision = '001_20260921_000000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Insert seed data for development"""

    # Generate consistent UUIDs for seed data
    dev_org_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    dev_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

    # Create development organization
    op.execute(
        f"""
        INSERT INTO crm_core.organizations (id, name, slug, description, is_active)
        VALUES ('{dev_org_id}'::uuid, 'Development Org', 'development-org', 'Default organization for development and testing', true)
        """
    )

    # Create default development user (demo@example.com)
    # Note: Password hash should be bcrypt hash of 'demo1234'
    # This is a placeholder - in production, use proper hashing
    demo_password_hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5YmMxSUmGEJiq'  # bcrypt hash of 'demo1234'

    op.execute(
        f"""
        INSERT INTO crm_core.users (
            id, organization_id, email, full_name, password_hash,
            role, is_active, email_verified
        ) VALUES (
            '{dev_user_id}'::uuid,
            '{dev_org_id}'::uuid,
            'demo@example.com',
            'Demo User',
            '{demo_password_hash}',
            'admin',
            true,
            true
        )
        """
    )


def downgrade() -> None:
    """Remove seed data"""
    op.execute("DELETE FROM crm_core.users WHERE email = 'demo@example.com'")
    op.execute("DELETE FROM crm_core.organizations WHERE slug = 'development-org'")
